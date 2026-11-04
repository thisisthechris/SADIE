"""Ticket price parsing and the free/paid flags it sets on Event during import."""

from datetime import datetime
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from events.models import Event

from .parsers import NormalizedBooking, _to_price, parse_digitickets_row, parse_eventbrite_row
from .services import ImportContext


def _booking(title: str, price: Decimal | None, user: str = "u1", qty: int = 1) -> NormalizedBooking:
    when = timezone.make_aware(datetime(2026, 3, 14, 19, 0))
    return NormalizedBooking(
        org_code="Theatre",
        channel="Test",
        event_title=title,
        event_datetime=when,
        postcode="PL4 5AB",
        user_hash=user,
        ticket_quantity=qty,
        attended_count=qty,
        purchase_datetime=when,
        ticket_price=price,
    )


class ToPriceTest(TestCase):
    def test_parses_plain_currency_and_thousands(self):
        self.assertEqual(_to_price("2.85"), Decimal("2.85"))
        self.assertEqual(_to_price("£12"), Decimal("12"))
        self.assertEqual(_to_price("1,200.00"), Decimal("1200.00"))

    def test_blank_invalid_and_negative_are_unknown(self):
        for value in ("", "  ", "free", "-3", None):
            self.assertIsNone(_to_price(value))


class ParserPriceTest(TestCase):
    def test_eventbrite_uses_ticket_price(self):
        row = {
            "Event_Name": "Gig",
            "Event_Date": "2026-01-31",
            "Email": "a@example.com",
            "Postcode": "PL4 5AB",
            "Quantity": "2",
            "Ticket_Price": "2.85",
            "Attendance_Status": "Attended",
        }
        self.assertEqual(parse_eventbrite_row(row, "PC").ticket_price, Decimal("2.85"))

    def test_digitickets_divides_order_value_by_quantity(self):
        row = {
            "Booking_Date": "2026-01-31 10:00",
            "Visit": "Gallery",
            "Email": "a@example.com",
            "Postcode": "PL4 5AB",
            "Quantity": "3",
            "Order_Value": "10.00",
        }
        self.assertEqual(parse_digitickets_row(row, "OCT").ticket_price, Decimal("3.33"))

    def test_digitickets_without_order_value_is_unknown(self):
        row = {"Booking_Date": "2026-01-31", "Visit": "Gallery", "Email": "a@example.com", "Postcode": "PL4 5AB"}
        self.assertIsNone(parse_digitickets_row(row, "OCT").ticket_price)


class ImportFreePaidTest(TestCase):
    def _import(self, *bookings: NormalizedBooking) -> None:
        ctx = ImportContext()
        for booking in bookings:
            ctx.record_booking(booking)
        ctx.flush()

    def test_all_zero_prices_mark_event_free(self):
        self._import(_booking("Free Talk", Decimal("0")), _booking("Free Talk", Decimal("0.00"), user="u2"))
        event = Event.objects.get(title="Free Talk")
        self.assertIs(event.is_free, True)
        self.assertIsNone(event.price)

    def test_any_paid_ticket_marks_event_paid_with_lowest_paid_price(self):
        self._import(
            _booking("Play", Decimal("0")),
            _booking("Play", Decimal("15.00"), user="u2"),
            _booking("Play", Decimal("9.50"), user="u3"),
        )
        event = Event.objects.get(title="Play")
        self.assertIs(event.is_free, False)
        self.assertEqual(event.price, Decimal("9.50"))

    def test_no_price_data_leaves_event_unknown(self):
        self._import(_booking("Mystery", None))
        event = Event.objects.get(title="Mystery")
        self.assertIsNone(event.is_free)
        self.assertIsNone(event.price)
