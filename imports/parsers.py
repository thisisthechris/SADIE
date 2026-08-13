"""
Parsers for the partner test-data CSV exports (see csv_exports/).

Each partner/vendor export has a distinct, fixed set of column headers. We
dispatch on the exact header tuple read from each file rather than trusting
filenames, so a parser is only ever applied to rows it actually understands.

SECURITY: Name/Email columns are read here and turned into a salted SHA-256
`user_hash` immediately — the raw email is never attached to the returned
`NormalizedBooking`, never logged, and name columns are never read at all.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from dateutil import parser as dateutil_parser
from django.utils import timezone

from .hashing import hash_email

# Organisation code -> real partner name. Numeric suffixes (Museum001..010,
# Theatre001..012, etc.) are all the SAME organisation — just separate export
# batches — so this maps only the letter-prefix/folder code.
ORG_CODE_MAP = {
    "Museum": "The Box",
    "OCT": "Ocean Conservation Trust",
    "PC": "Plymouth Culture",
    "RI": "Real Ideas Organisation",
    "Theatre": "Theatre Royal Plymouth",
    "AUP": "Arts University Plymouth",
}

_PREFIX_RE = re.compile(r"^([A-Za-z]+)\d+_")


class UnknownOrganisationCode(ValueError):
    """Raised when a file/folder can't be resolved to a known org code."""


# Booking-reference prefixes that override the filename-based org code.
# e.g. Museum001_attendance.csv carries AUP-AUP-* refs → AUP, not Museum.
_BOOKING_REF_PREFIX_TO_ORG: dict[str, str] = {
    "AUP": "AUP",
    "MUS": "Museum",
}


def _sniff_org_from_booking_ref(file_path: Path, fallback: str) -> str:
    """Peek at the first data row's Booking_Reference to confirm the org code."""
    import csv as _csv

    try:
        with file_path.open(newline="", encoding="utf-8-sig") as fh:
            reader = _csv.DictReader(fh)
            for row in reader:
                ref = (row.get("Booking_Reference") or "").strip()
                prefix = ref.split("-")[0]
                if prefix in _BOOKING_REF_PREFIX_TO_ORG:
                    return _BOOKING_REF_PREFIX_TO_ORG[prefix]
                break  # only need the first row
    except Exception:  # noqa: BLE001
        pass
    return fallback


def resolve_org_code(file_path: Path) -> str:
    """
    Resolve the partner org code for a CSV file.

    1. Try a filename prefix like 'Museum003_attendance.csv' -> 'Museum'.
    2. Otherwise fall back to the immediate parent folder name, e.g.
       'OCT/digitickets_export.csv' -> 'OCT'.
    3. For Museum attendance files, sniff the first Booking_Reference to
       distinguish AUP data (AUP-AUP-* refs) from The Box data (MUS-Museum-*).
    """
    match = _PREFIX_RE.match(file_path.name)
    code = match.group(1) if match else file_path.parent.name
    if code not in ORG_CODE_MAP:
        raise UnknownOrganisationCode(f"Cannot resolve organisation code for {file_path.name!r} (got {code!r})")
    # Museum*_attendance.csv files may carry AUP-AUP-* refs — confirm via sniff.
    if code == "Museum" and "_attendance" in file_path.stem:
        code = _sniff_org_from_booking_ref(file_path, fallback=code)
    return code


@dataclass
class NormalizedBooking:
    """A single booking/attendance row, normalized across all source formats.

    Deliberately holds NO raw PII — only a pre-computed `user_hash`.
    """

    org_code: str
    channel: str
    event_title: str
    event_datetime: datetime
    postcode: str
    user_hash: str
    ticket_quantity: int
    attended_count: int
    purchase_datetime: datetime
    venue_name: str | None = None
    has_ticket_data: bool = True

    @property
    def attended(self) -> bool:
        return self.attended_count > 0


def _parse_dt(value: str) -> datetime | None:
    """Parse a CSV datetime string into an aware datetime, or None if blank/invalid."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        dt = dateutil_parser.parse(value)
    except (ValueError, OverflowError):
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _to_int(value: str, default: int = 0) -> int:
    value = (value or "").strip()
    if not value:
        return default
    try:
        return int(float(value))
    except ValueError:
        return default


def _clean_postcode(raw: str) -> str:
    """
    Clean up this test data's slightly malformed postcodes before handing
    off to analytics.geocoding.normalize_postcode.

    Some exports render e.g. 'PL4 5 HN' (outward code, then the inward
    code split across two space-separated tokens) instead of 'PL4 5HN'.
    Merge a trailing lone digit + 2-letter token pair back together.
    """
    raw = (raw or "").strip().upper()
    parts = raw.split()
    if len(parts) == 3 and len(parts[1]) == 1 and parts[1].isdigit() and len(parts[2]) == 2 and parts[2].isalpha():
        parts = [parts[0], parts[1] + parts[2]]
    return " ".join(parts)


# ---------------------------------------------------------------------------
#  Per-source parsers
# ---------------------------------------------------------------------------


def parse_eventbrite_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Email", "")
    postcode = _clean_postcode(row.get("Postcode", ""))
    event_dt = _parse_dt(row.get("Event_Date", ""))
    if not email or not postcode or not event_dt:
        return None

    quantity = _to_int(row.get("Quantity", ""), default=1)
    status = (row.get("Attendance_Status") or "").strip()
    # "Partial" means at least some of the party attended; we don't have a
    # per-seat breakdown so the full party is counted as attended headcount.
    attended_count = quantity if status in ("Attended", "Partial") else 0
    purchase_dt = _parse_dt(row.get("Purchase_Date", "")) or event_dt

    return NormalizedBooking(
        org_code=org_code,
        channel="Eventbrite",
        event_title=(row.get("Event_Name") or "").strip(),
        event_datetime=event_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=quantity,
        attended_count=attended_count,
        purchase_datetime=purchase_dt,
    )


def parse_digitickets_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Email", "")
    postcode = _clean_postcode(row.get("Postcode", ""))
    # No distinct event-date column in this export — Booking_Date doubles as
    # both the visit/event date and the purchase date.
    booking_dt = _parse_dt(row.get("Booking_Date", ""))
    if not email or not postcode or not booking_dt:
        return None

    quantity = _to_int(row.get("Quantity", ""), default=1)

    return NormalizedBooking(
        org_code=org_code,
        channel="Digitickets",
        event_title=(row.get("Visit") or "").strip(),
        event_datetime=booking_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=quantity,
        attended_count=quantity,  # no no-show tracking in this export
        purchase_datetime=booking_dt,
    )


def parse_monday_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Email", "")
    postcode = _clean_postcode(row.get("Postcode", ""))
    event_dt = _parse_dt(row.get("Event_Date", ""))
    if not email or not postcode or not event_dt:
        return None

    status = (row.get("Status") or "").strip()
    attended_count = 1 if status == "Attended" else 0

    return NormalizedBooking(
        org_code=org_code,
        channel="Monday.com CRM",
        event_title=(row.get("Event") or "").strip(),
        event_datetime=event_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=1,
        attended_count=attended_count,
        purchase_datetime=event_dt,
        has_ticket_data=False,  # a CRM record, not a real ticket transaction
    )


def parse_theatre_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Customer_Email", "")
    postcode = _clean_postcode(row.get("Customer_Postcode", ""))
    # No distinct purchase-date column in this export — Performance_Date
    # doubles as both the event date and the purchase date.
    event_dt = _parse_dt(row.get("Performance_Date", ""))
    if not email or not postcode or not event_dt:
        return None

    tickets = _to_int(row.get("Tickets", ""), default=1)
    attendance_raw = (row.get("Attendance") or "").strip()
    # Attendance is a headcount (<= Tickets); blank means not recorded —
    # assume full attendance in that case.
    attended_count = _to_int(attendance_raw, default=tickets) if attendance_raw else tickets

    return NormalizedBooking(
        org_code=org_code,
        channel="Theatre Box Office",
        event_title=(row.get("Performance") or "").strip(),
        event_datetime=event_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=tickets,
        attended_count=attended_count,
        purchase_datetime=event_dt,
        venue_name=(row.get("Venue") or "").strip() or None,
    )


def parse_museum_attendance_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Email", "")
    postcode = _clean_postcode(row.get("Postcode", ""))
    # No distinct purchase-date column — Date doubles as both.
    event_dt = _parse_dt(row.get("Date", ""))
    if not email or not postcode or not event_dt:
        return None

    tickets = _to_int(row.get("Tickets_Booked", ""), default=1)
    attended_count = _to_int(row.get("Attended", ""), default=tickets)

    return NormalizedBooking(
        org_code=org_code,
        channel="Museum Attendance Register",
        event_title=(row.get("Event") or "").strip(),
        event_datetime=event_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=tickets,
        attended_count=attended_count,
        purchase_datetime=event_dt,
    )


def parse_museum_booking_export_row(row: dict, org_code: str) -> NormalizedBooking | None:
    email = row.get("Email", "")
    postcode = _clean_postcode(row.get("Postcode", ""))
    event_dt = _parse_dt(row.get("Visit_Date", ""))
    if not email or not postcode or not event_dt:
        return None

    total_attendees = _to_int(row.get("Total_Attendees", ""), default=1)
    purchase_dt = _parse_dt(row.get("Booking_Date", "")) or event_dt

    return NormalizedBooking(
        org_code=org_code,
        channel="Museum Booking Export",
        event_title=(row.get("Session") or "").strip(),
        event_datetime=event_dt,
        postcode=postcode,
        user_hash=hash_email(email),
        ticket_quantity=total_attendees,
        attended_count=total_attendees,  # no no-show tracking in this export
        purchase_datetime=purchase_dt,
    )


# Dispatch table: exact CSV header tuple -> (parser function, human label).
HEADER_PARSERS = {
    (
        "Order_ID",
        "Event_Name",
        "Event_Date",
        "First_Name",
        "Last_Name",
        "Email",
        "Postcode",
        "Ticket_Type",
        "Quantity",
        "Ticket_Price",
        "Purchase_Date",
        "Attendance_Status",
    ): (parse_eventbrite_row, "Eventbrite"),
    (
        "Booking_Reference",
        "Booking_Date",
        "Visit",
        "Email",
        "Postcode",
        "Ticket_Type",
        "Quantity",
        "Order_Value",
        "Donation",
        "Gift_Aid",
        "Promo_Code",
    ): (parse_digitickets_row, "Digitickets"),
    (
        "Item",
        "Contact_Name",
        "Email",
        "Postcode",
        "Event",
        "Event_Date",
        "Status",
        "Comments",
    ): (parse_monday_row, "Monday.com CRM"),
    (
        "Booking_ID",
        "Customer_Email",
        "Customer_Postcode",
        "Customer_Name",
        "Performance",
        "Performance_Date",
        "Venue",
        "Tickets",
        "Seat_Category",
        "Booking_Channel",
        "Membership_Status",
        "Attendance",
    ): (parse_theatre_row, "Theatre Box Office"),
    (
        "Booking_Reference",
        "Event",
        "Date",
        "Name",
        "Email",
        "Postcode",
        "Tickets_Booked",
        "Attended",
        "Notes",
    ): (parse_museum_attendance_row, "Museum Attendance Register"),
    (
        "Booking_Reference",
        "Session",
        "Visit_Date",
        "Email",
        "Postcode",
        "Adults",
        "Children",
        "Total_Attendees",
        "Booking_Date",
    ): (parse_museum_booking_export_row, "Museum Booking Export"),
}


def get_parser_for_header(header: list[str]):
    """Return (parser_fn, label) for a CSV header, or None if unrecognised."""
    return HEADER_PARSERS.get(tuple(header))
