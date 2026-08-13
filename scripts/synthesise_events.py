"""
Standalone script to synthesise an enriched events catalogue from the partner
booking CSVs in csv_exports/.

Reads every recognised booking CSV, extracts unique (org_code, event_title,
event_date) triples, then assigns a best-guess category, description,
start time, end time, and a placeholder URL for each.

Output: csv_exports/synthesised_events.csv

Usage (from repo root):
    python scripts/synthesise_events.py
    python scripts/synthesise_events.py --csv-dir path/to/csv_exports --out path/to/output.csv

Commit the generated CSV so it is available to the `enrich_events` management
command during a Render deploy (no network or Django required to run this
script — pure stdlib).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path

SKIP_FILES = {"_conversion_manifest.csv", "synthesised_events.csv"}

ORG_CODE_MAP = {
    "Museum": "The Box",
    "AUP": "Arts University Plymouth",
    "OCT": "Ocean Conservation Trust",
    "PC": "Plymouth Culture",
    "RI": "Real Ideas Organisation",
    "Theatre": "Theatre Royal Plymouth",
}

_PREFIX_RE = re.compile(r"^([A-Za-z]+)\d*_")

# Booking-reference prefixes that override the filename-based org code.
# Museum001..010_attendance.csv carry AUP-AUP-* refs → AUP, not Museum.
_BOOKING_REF_PREFIX_TO_ORG: dict[str, str] = {
    "AUP": "AUP",
    "MUS": "Museum",
}


def resolve_org_code(file_path: Path) -> str | None:
    match = _PREFIX_RE.match(file_path.name)
    code = match.group(1) if match else file_path.parent.name
    return code if code in ORG_CODE_MAP else None


# ---------------------------------------------------------------------------
#  Event title → (category, default_start_hour, default_duration_hours)
# ---------------------------------------------------------------------------

TITLE_META: dict[str, tuple[str, int, float]] = {
    # title (lowercase)                       category            hour  dur
    "artist talk":                           ("Heritage",          18,  1.5),
    "creative drop-in":                      ("Workshop",          11,  2.0),
    "open studio day":                       ("Visual Arts",       10,  6.0),
    "community exhibition":                  ("Exhibition",        10,  5.0),
    "neighbourhood arts session":            ("Community",         17,  2.0),
    "museum discovery session":              ("Heritage",          10,  2.0),
    "family gallery trail":                  ("Family",            10,  2.0),
    "object handling session":               ("Heritage",          13,  1.5),
    "archive visit":                         ("Heritage",          10,  2.0),
    "local history talk":                    ("Literature",        18,  1.5),
    "behind the scenes tour":                ("Heritage",          11,  1.5),
    "community collection day":              ("Community",         10,  5.0),
    "school holiday activity":               ("Family",            10,  3.0),
    "history workshop":                      ("Workshop",          10,  2.0),
    "exhibition tour":                       ("Exhibition",        13,  1.5),
    "live performance":                      ("Music",             19,  2.0),
    "annual celebration":                    ("Festival",          18,  3.0),
    "artist residency event":                ("Visual Arts",       18,  2.0),
    "music showcase":                        ("Music",             19,  2.5),
    "season launch":                         ("Festival",          18,  2.0),
    "theatre night":                         ("Theatre",           19,  2.5),
    "comedy performance":                    ("Comedy",            20,  2.0),
    "guest speaker":                         ("Literature",        18,  1.5),
    "cultural evening":                      ("Community",         18,  2.0),
    "creative workshop":                     ("Workshop",          10,  2.0),
    "public forum":                          ("Community",         18,  2.0),
    "classic revisited":                     ("Theatre",           19,  2.5),
    "local artists showcase":                ("Exhibition",        11,  5.0),
    "local history talk":                    ("Heritage",          18,  1.5),
}

# Fallback for unrecognised titles
_DEFAULT_META: tuple[str, int, float] = ("Community", 18, 2.0)


def _meta_for(title: str) -> tuple[str, int, float]:
    return TITLE_META.get(title.strip().lower(), _DEFAULT_META)


# ---------------------------------------------------------------------------
#  Description templates per category
# ---------------------------------------------------------------------------

DESCRIPTIONS: dict[str, list[str]] = {
    "Heritage": [
        "Explore Plymouth's rich history through guided talks, artefacts, and archival material. "
        "Led by our expert team, this session offers a rare look behind the scenes of our collections.",
        "Join us for an immersive session delving into the stories that shaped Plymouth and the South West. "
        "Perfect for history enthusiasts of all ages.",
        "A fascinating look at Plymouth's cultural and maritime heritage. "
        "Our team of experts will guide you through rarely seen collections and archival treasures.",
    ],
    "Workshop": [
        "Get hands-on and develop your creative skills in this friendly, structured workshop. "
        "All materials provided — no experience necessary.",
        "Join our skilled facilitators for a practical, creative session. "
        "Whether you're a complete beginner or looking to refine your craft, all are welcome.",
        "A relaxed, drop-in style workshop where you can explore new techniques at your own pace. "
        "Materials and guidance provided throughout.",
    ],
    "Visual Arts": [
        "Step inside the creative process and discover the work of artists at the heart of Plymouth's "
        "vibrant arts scene. Studios open, artists present.",
        "A celebration of visual art in all its forms. Browse works in progress, meet the makers, "
        "and explore our dedicated studios and gallery spaces.",
        "An open invitation to engage with Plymouth's creative community. "
        "Artists from across the region will be sharing their work and practice.",
    ],
    "Exhibition": [
        "Discover our latest exhibition featuring works by local and regional artists. "
        "Free to attend — suitable for all ages.",
        "A curated display bringing together diverse perspectives and artistic voices from across Plymouth "
        "and beyond. Guided tours available on request.",
        "Explore our current exhibition and learn more about the artists and themes behind the work. "
        "Gallery staff on hand to answer questions.",
    ],
    "Community": [
        "A welcoming community event bringing Plymouth residents together to share, connect, and celebrate "
        "the city's creative culture.",
        "Open to everyone — come along and be part of Plymouth's vibrant community arts scene. "
        "Refreshments provided.",
        "Join us for this relaxed community gathering, celebrating arts, culture, and the people "
        "who make Plymouth such a special place.",
    ],
    "Family": [
        "A fun-filled session designed for families with children of all ages. "
        "Hands-on activities, stories, and creative play await!",
        "Bring the whole family for an afternoon of creative discovery. "
        "Activities are designed to be enjoyed together, with something for every age.",
        "Perfect for families looking for a memorable cultural day out. "
        "Engaging activities, friendly staff, and a welcoming environment for children and adults alike.",
    ],
    "Music": [
        "An unmissable evening of live music in one of Plymouth's most atmospheric venues. "
        "From intimate performances to full ensemble showcases.",
        "Join us for a night of outstanding musical talent. "
        "Showcasing performers from across the region and beyond.",
        "A wonderful opportunity to experience live music at its best. "
        "Tickets selling fast — book early to avoid disappointment.",
    ],
    "Theatre": [
        "An unforgettable theatrical experience from one of Plymouth's leading performing arts organisations. "
        "Not to be missed.",
        "Join us for a spellbinding evening of theatre. "
        "Featuring outstanding performances from our talented ensemble company.",
        "A night of captivating storytelling and performance. "
        "Suitable for adults and older teens — booking recommended.",
    ],
    "Comedy": [
        "An evening of top-drawer comedy guaranteed to leave you in stitches. "
        "Featuring a stellar line-up of local and national acts.",
        "Sit back and enjoy an unforgettable night of stand-up comedy "
        "in the heart of Plymouth. Doors open 30 minutes before showtime.",
        "Plymouth's favourite comedy night returns! "
        "Join us for a brilliant evening of laughs with some of the UK's funniest comedians.",
    ],
    "Literature": [
        "An inspiring evening of words, ideas, and conversation. "
        "Join us to hear from a fascinating speaker on topics ranging from local history to global culture.",
        "A thought-provoking talk from an expert voice in their field. "
        "Questions and discussion welcome — books available to purchase on the night.",
        "An unmissable literary event celebrating the power of storytelling and the written word. "
        "Light refreshments provided.",
    ],
    "Festival": [
        "Celebrate Plymouth's thriving arts and culture scene at this landmark annual event. "
        "Activities, performances, and experiences for all.",
        "A spectacular celebration bringing together artists, performers, and audiences "
        "from across the city and beyond. Free entry — all welcome.",
        "Our flagship seasonal event, showcasing the very best of Plymouth's creative community. "
        "Join the festivities and be part of something truly special.",
    ],
}

_DEFAULT_DESC = (
    "An exciting event from one of Plymouth's leading cultural organisations. "
    "Join us for a fantastic experience in the heart of Plymouth's arts scene."
)


def _description_for(title: str, org_name: str, category: str, event_date: date) -> str:
    templates = DESCRIPTIONS.get(category, [_DEFAULT_DESC])
    # Pick deterministically based on title hash so reruns give the same result
    idx = abs(hash(title.lower())) % len(templates)
    base = templates[idx]
    return base


# ---------------------------------------------------------------------------
#  CSV row extraction helpers (mirrors parsers.py logic without Django deps)
# ---------------------------------------------------------------------------

def _extract_bookings(csv_path: Path, org_code: str) -> list[tuple[str, str, str]]:
    """
    Return a list of (org_code, event_title, event_date_str) tuples from a
    single booking CSV file.  event_date_str is an ISO date 'YYYY-MM-DD'.
    """
    results = []
    try:
        with csv_path.open(newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            headers = tuple(reader.fieldnames or [])

            # Detect format from headers
            if "Event_Name" in headers and "Event_Date" in headers:
                # Eventbrite
                for row in reader:
                    title = (row.get("Event_Name") or "").strip()
                    date_str = (row.get("Event_Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

            elif "Visit" in headers and "Booking_Date" in headers:
                # Digitickets (OCT) — Booking_Date doubles as event date
                for row in reader:
                    title = (row.get("Visit") or "").strip()
                    date_str = (row.get("Booking_Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

            elif "Event" in headers and "Event_Date" in headers:
                # Monday CRM (RI)
                for row in reader:
                    title = (row.get("Event") or "").strip()
                    date_str = (row.get("Event_Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

            elif "Performance" in headers and "Performance_Date" in headers:
                # Theatre box office
                for row in reader:
                    title = (row.get("Performance") or "").strip()
                    date_str = (row.get("Performance_Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

            elif "Event" in headers and "Date" in headers:
                # Museum attendance register — sniff first Booking_Reference to
                # distinguish AUP-AUP-* (Arts University Plymouth) from
                # MUS-Museum-* (The Box); both file types share this format.
                rows_list = list(reader)
                if rows_list:
                    first_ref = (rows_list[0].get("Booking_Reference") or "").strip()
                    ref_prefix = first_ref.split("-")[0]
                    if ref_prefix in _BOOKING_REF_PREFIX_TO_ORG:
                        org_code = _BOOKING_REF_PREFIX_TO_ORG[ref_prefix]
                for row in rows_list:
                    title = (row.get("Event") or "").strip()
                    date_str = (row.get("Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

            elif "Session" in headers and "Visit_Date" in headers:
                # Museum booking export
                for row in reader:
                    title = (row.get("Session") or "").strip()
                    date_str = (row.get("Visit_Date") or "").strip()[:10]
                    if title and date_str:
                        results.append((org_code, title, date_str))

    except Exception as exc:
        print(f"  WARNING: skipping {csv_path.name}: {exc}", file=sys.stderr)

    return results


def _is_valid_date(date_str: str) -> bool:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def synthesise(csv_dir: Path, out_path: Path) -> None:
    csv_files = sorted(p for p in csv_dir.rglob("*.csv") if p.name not in SKIP_FILES)
    if not csv_files:
        print(f"No CSV files found under {csv_dir}", file=sys.stderr)
        sys.exit(1)

    # Gather (org_code, title, date_str) → keep all distinct dates per (org, title)
    # grouped as:  (org_code, title) -> {date_str: True}
    seen: dict[tuple[str, str], dict[str, bool]] = defaultdict(dict)

    for csv_path in csv_files:
        org_code = resolve_org_code(csv_path)
        if org_code is None:
            continue
        bookings = _extract_bookings(csv_path, org_code)
        for org_code_b, title, date_str in bookings:
            if title and _is_valid_date(date_str):
                seen[(org_code_b, title)][date_str] = True

    # For Digitickets (OCT) the booking date IS the event visit date and they
    # vary per booking — deduplicate to one event per (title, calendar_month)
    # so we get a manageable number of distinct Event records.
    deduped: dict[tuple[str, str, str], bool] = {}  # (org_code, title, date_str)
    for (org_code, title), dates in seen.items():
        sorted_dates = sorted(dates.keys())
        if org_code == "OCT":
            # Keep one date per month
            months_seen: set[str] = set()
            for d in sorted_dates:
                month = d[:7]  # YYYY-MM
                if month not in months_seen:
                    months_seen.add(month)
                    deduped[(org_code, title, d)] = True
        else:
            # Keep all distinct dates
            for d in sorted_dates:
                deduped[(org_code, title, d)] = True

    rows = sorted(deduped.keys(), key=lambda x: (x[0], x[2], x[1]))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "org_code", "org_name", "event_title", "event_date",
            "event_time", "end_time", "category", "description", "url",
        ])

        for org_code, title, date_str in rows:
            org_name = ORG_CODE_MAP.get(org_code, org_code)
            category, default_hour, duration = _meta_for(title)

            # Build start / end times
            start_t = time(hour=default_hour, minute=0)
            end_dt = datetime.combine(
                datetime.strptime(date_str, "%Y-%m-%d").date(),
                start_t,
            ) + timedelta(hours=duration)
            end_t = end_dt.time()

            event_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            description = _description_for(title, org_name, category, event_date)

            writer.writerow([
                org_code,
                org_name,
                title,
                date_str,
                start_t.strftime("%H:%M"),
                end_t.strftime("%H:%M"),
                category,
                description,
                "",  # placeholder URL — the import command leaves it blank if empty
            ])

    print(f"Written {len(rows)} event rows → {out_path}")
    # Summary
    by_org: dict[str, int] = defaultdict(int)
    for org_code, _, _ in rows:
        by_org[org_code] += 1
    for org, cnt in sorted(by_org.items()):
        print(f"  {org:10s}  {cnt} events")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    repo_root = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--csv-dir",
        type=Path,
        default=repo_root / "csv_exports",
        help="Directory containing partner booking CSVs (default: csv_exports/)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=repo_root / "csv_exports" / "synthesised_events.csv",
        help="Output CSV path (default: csv_exports/synthesised_events.csv)",
    )
    args = parser.parse_args()
    synthesise(args.csv_dir, args.out)


if __name__ == "__main__":
    main()
