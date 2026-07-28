"""
Tests for the partner CSV import pipeline (imports app).

Covers: hashing determinism, org-code resolution, one test per source-format
parser using real sample rows, and an end-to-end command run that asserts
zero PII leakage into the database.
"""

import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings

from analytics.models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)
from events.models import Event
from organisations.models import Organisation

from .hashing import hash_email, normalize_email
from .parsers import (
    UnknownOrganisationCode,
    parse_digitickets_row,
    parse_eventbrite_row,
    parse_monday_row,
    parse_museum_attendance_row,
    parse_museum_booking_export_row,
    parse_theatre_row,
    resolve_org_code,
)


class HashingTest(TestCase):
    def test_normalize_email(self):
        self.assertEqual(normalize_email("  Foo.Bar@Example.COM "), "foo.bar@example.com")

    def test_hash_is_deterministic_64_hex(self):
        h1 = hash_email("poppy.jones12@gmail.com")
        h2 = hash_email("Poppy.Jones12@Gmail.com  ")
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)
        int(h1, 16)  # raises ValueError if not hex

    @override_settings(PII_HASH_SALT="salt-a")
    def test_different_salt_changes_hash(self):
        with_salt_a = hash_email("someone@example.com")
        with override_settings(PII_HASH_SALT="salt-b"):
            with_salt_b = hash_email("someone@example.com")
        self.assertNotEqual(with_salt_a, with_salt_b)


class ResolveOrgCodeTest(TestCase):
    def test_filename_prefix(self):
        self.assertEqual(resolve_org_code(Path("Museum/Museum003_attendance.csv")), "Museum")
        self.assertEqual(resolve_org_code(Path("PC/AUP002_Eventbrite.csv")), "AUP")
        self.assertEqual(resolve_org_code(Path("PC/OCT001_Eventbrite.csv")), "OCT")

    def test_folder_fallback(self):
        self.assertEqual(resolve_org_code(Path("OCT/digitickets_export.csv")), "OCT")
        self.assertEqual(resolve_org_code(Path("RI/monday_export.csv")), "RI")
        self.assertEqual(resolve_org_code(Path("Theatre/theatre_box_office_export.csv")), "Theatre")
        self.assertEqual(resolve_org_code(Path("Museum/museum_booking_export.csv")), "Museum")

    def test_unknown_code_raises(self):
        with self.assertRaises(UnknownOrganisationCode):
            resolve_org_code(Path("Unknown/whatever_export.csv"))


class ParserTest(TestCase):
    """One test per source format, using a real sample row from csv_exports/."""

    def test_eventbrite(self):
        row = {
            "Order_ID": "EVB-PC-399641",
            "Event_Name": "Classic Revisited",
            "Event_Date": "2026-10-27",
            "First_Name": "Sophie",
            "Last_Name": "Jackson",
            "Email": "sophie.jackson86@yahoo.co.uk",
            "Postcode": "PL6 6 SK",
            "Ticket_Type": "General Admission",
            "Quantity": "1",
            "Ticket_Price": "20.65",
            "Purchase_Date": "2026-08-10 18:00",
            "Attendance_Status": "Partial",
        }
        booking = parse_eventbrite_row(row, "Theatre")
        self.assertIsNotNone(booking)
        self.assertEqual(booking.event_title, "Classic Revisited")
        self.assertEqual(booking.postcode, "PL6 6SK")
        self.assertEqual(booking.ticket_quantity, 1)
        self.assertTrue(booking.attended)
        self.assertEqual(len(booking.user_hash), 64)

    def test_eventbrite_no_show_not_attended(self):
        row = {
            "Order_ID": "x",
            "Event_Name": "Show",
            "Event_Date": "2026-10-27",
            "First_Name": "A",
            "Last_Name": "B",
            "Email": "a@example.com",
            "Postcode": "PL1 1AA",
            "Ticket_Type": "General",
            "Quantity": "2",
            "Ticket_Price": "10",
            "Purchase_Date": "2026-08-10",
            "Attendance_Status": "No-show",
        }
        booking = parse_eventbrite_row(row, "Theatre")
        self.assertFalse(booking.attended)
        self.assertEqual(booking.attended_count, 0)
        self.assertEqual(booking.ticket_quantity, 2)  # ticket still counted

    def test_digitickets(self):
        row = {
            "Booking_Reference": "DIGI-OCT-807039",
            "Booking_Date": "2026-02-17 19:59:59.999997",
            "Visit": "Artist Talk",
            "Email": "jessica.ward26@icloud.com",
            "Postcode": "PL1 7 GK",
            "Ticket_Type": "Adult",
            "Quantity": "2",
            "Order_Value": "9.24",
            "Donation": "10",
            "Gift_Aid": "FALSE",
            "Promo_Code": "WELCOME",
        }
        booking = parse_digitickets_row(row, "OCT")
        self.assertIsNotNone(booking)
        self.assertEqual(booking.event_title, "Artist Talk")
        self.assertEqual(booking.ticket_quantity, 2)
        self.assertTrue(booking.attended)
        self.assertEqual(booking.event_datetime, booking.purchase_datetime)

    def test_monday(self):
        row = {
            "Item": "RI-RI-974450",
            "Contact_Name": "Phoebe Hill",
            "Email": "phoebe.hill54@icloud.com",
            "Postcode": "TA1 2 EE",
            "Event": "Artist Talk",
            "Event_Date": "2026-03-26",
            "Status": "Confirmed",
            "Comments": "Follow up required",
        }
        booking = parse_monday_row(row, "RI")
        self.assertIsNotNone(booking)
        self.assertFalse(booking.attended)  # "Confirmed" != "Attended"
        self.assertFalse(booking.has_ticket_data)

        row["Status"] = "Attended"
        booking2 = parse_monday_row(row, "RI")
        self.assertTrue(booking2.attended)

    def test_theatre(self):
        row = {
            "Booking_ID": "TH-Theatre-547932",
            "Customer_Email": "amelia.scott65@yahoo.co.uk",
            "Customer_Postcode": "PL9 2 RR",
            "Customer_Name": "Amelia Scott",
            "Performance": "Artist Talk",
            "Performance_Date": "2026-03-26",
            "Venue": "University Space",
            "Tickets": "2",
            "Seat_Category": "Standard",
            "Booking_Channel": "Phone",
            "Membership_Status": "Non-member",
            "Attendance": "",
        }
        booking = parse_theatre_row(row, "Theatre")
        self.assertIsNotNone(booking)
        self.assertEqual(booking.venue_name, "University Space")
        self.assertEqual(booking.attended_count, 2)  # blank Attendance -> assume full

        row["Attendance"] = "0"
        booking2 = parse_theatre_row(row, "Theatre")
        self.assertFalse(booking2.attended)

    def test_museum_attendance(self):
        row = {
            "Booking_Reference": "AUP-AUP-498097",
            "Event": "Family Gallery Trail",
            "Date": "2026-03-03",
            "Name": "Poppy Jones",
            "Email": "poppy.jones12@gmail.com",
            "Postcode": "PL4 5 HN",
            "Tickets_Booked": "2",
            "Attended": "2",
            "Notes": "",
        }
        booking = parse_museum_attendance_row(row, "Museum")
        self.assertIsNotNone(booking)
        self.assertEqual(booking.postcode, "PL4 5HN")
        self.assertEqual(booking.ticket_quantity, 2)
        self.assertEqual(booking.attended_count, 2)

        # Partial attendance (booked 3, only 2 attended)
        row2 = dict(row, Tickets_Booked="3", Attended="2")
        booking2 = parse_museum_attendance_row(row2, "Museum")
        self.assertEqual(booking2.ticket_quantity, 3)
        self.assertEqual(booking2.attended_count, 2)

    def test_museum_booking_export(self):
        row = {
            "Booking_Reference": "MUS-Museum-139971",
            "Session": "Artist Talk",
            "Visit_Date": "2026-03-26",
            "Email": "alice.turner96@outlook.com",
            "Postcode": "TQ4 6 CD",
            "Adults": "1",
            "Children": "0",
            "Total_Attendees": "1",
            "Booking_Date": "2025-12-26 10:00:00.000003",
        }
        booking = parse_museum_booking_export_row(row, "Museum")
        self.assertIsNotNone(booking)
        self.assertEqual(booking.ticket_quantity, 1)
        self.assertNotEqual(booking.event_datetime, booking.purchase_datetime)

    def test_missing_email_skips_row(self):
        row = {
            "Order_ID": "x",
            "Event_Name": "Show",
            "Event_Date": "2026-10-27",
            "First_Name": "A",
            "Last_Name": "B",
            "Email": "",
            "Postcode": "PL1 1AA",
            "Ticket_Type": "General",
            "Quantity": "2",
            "Ticket_Price": "10",
            "Purchase_Date": "2026-08-10",
            "Attendance_Status": "Attended",
        }
        self.assertIsNone(parse_eventbrite_row(row, "Theatre"))


EVENTBRITE_CSV = """Order_ID,Event_Name,Event_Date,First_Name,Last_Name,Email,Postcode,Ticket_Type,Quantity,Ticket_Price,Purchase_Date,Attendance_Status
EVB-PC-399641,Classic Revisited,2026-10-27,Sophie,Jackson,sophie.jackson86@yahoo.co.uk,PL6 6 SK,General Admission,1,20.65,2026-08-10 18:00,Attended
EVB-PC-902464,Classic Revisited,2026-10-27,Megan,Morgan,megan.morgan72@outlook.com,TQ12 7 OO,General Admission,1,20.65,2026-08-30 16:00:00.000003,No-show
"""

MUSEUM_ATTENDANCE_CSV = """Booking_Reference,Event,Date,Name,Email,Postcode,Tickets_Booked,Attended,Notes
AUP-AUP-498097,Family Gallery Trail,2026-03-03,Poppy Jones,poppy.jones12@gmail.com,PL4 5 HN,2,2,
AUP-AUP-250463,Family Gallery Trail,2026-03-03,Ruby Davies,ruby.davies1@yahoo.co.uk,PL4 3 KI,1,1,Local resident
"""


class EndToEndImportTest(TestCase):
    """Runs the real management command against small fixture CSVs."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp_dir.cleanup)
        base = Path(self.tmp_dir.name)
        (base / "PC").mkdir()
        (base / "Museum").mkdir()
        (base / "PC" / "Theatre001_Eventbrite.csv").write_text(EVENTBRITE_CSV)
        (base / "Museum" / "Museum001_attendance.csv").write_text(MUSEUM_ATTENDANCE_CSV)
        self.base_path = base

    def test_import_creates_expected_rows_with_no_pii(self):
        call_command("import_partner_csv", path=str(self.base_path))

        self.assertEqual(Organisation.objects.filter(is_partner=True).count(), 2)
        self.assertTrue(Event.objects.filter(title="Classic Revisited").exists())
        self.assertTrue(Event.objects.filter(title="Family Gallery Trail").exists())

        # Only the attended Eventbrite row (1 of 2) + both museum rows create interactions.
        self.assertEqual(UserHashInteraction.objects.count(), 3)
        for uh in UserHashInteraction.objects.all():
            self.assertEqual(len(uh.user_hash), 64)
            int(uh.user_hash, 16)

        # 4 tickets purchases recorded (both Eventbrite rows + both museum rows) —
        # ticket purchases are recorded regardless of attendance/no-show.
        self.assertEqual(PostcodeTicketPurchase.objects.count(), 4)
        self.assertTrue(PostcodeEventInteraction.objects.exists())
        self.assertTrue(PostcodeAreaInteraction.objects.exists())

        # No raw PII anywhere in the DB.
        needles = [
            "sophie.jackson86@yahoo.co.uk",
            "megan.morgan72@outlook.com",
            "poppy.jones12@gmail.com",
            "ruby.davies1@yahoo.co.uk",
            "Sophie Jackson",
            "Poppy Jones",
        ]
        for model in (UserHashInteraction, PostcodeTicketPurchase, PostcodeEventInteraction, PostcodeAreaInteraction):
            for obj in model.objects.all():
                row_repr = repr(obj.__dict__)
                for needle in needles:
                    self.assertNotIn(needle, row_repr)

    def test_dry_run_makes_no_db_changes(self):
        call_command("import_partner_csv", path=str(self.base_path), dry_run=True)
        self.assertEqual(Organisation.objects.count(), 0)
        self.assertEqual(UserHashInteraction.objects.count(), 0)

    def test_clear_removes_previous_partner_data(self):
        call_command("import_partner_csv", path=str(self.base_path))
        first_count = UserHashInteraction.objects.count()
        self.assertGreater(first_count, 0)

        call_command("import_partner_csv", path=str(self.base_path), clear=True)
        # Re-importing after --clear should produce the same counts, not double them.
        self.assertEqual(UserHashInteraction.objects.count(), first_count)
