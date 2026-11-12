"""Weekly report periods and trend buckets (analytics.queries)."""

from datetime import date
from unittest import mock

from django.test import SimpleTestCase

from .queries import bucket_start, last_complete_week, parse_filter_params


class LastCompleteWeekTest(SimpleTestCase):
    def test_rolls_forward_on_monday(self):
        self.assertEqual(last_complete_week(date(2026, 11, 9)), (date(2026, 11, 2), date(2026, 11, 8)))
        self.assertEqual(last_complete_week(date(2026, 11, 16)), (date(2026, 11, 9), date(2026, 11, 15)))

    def test_sunday_still_reports_the_previous_week(self):
        self.assertEqual(last_complete_week(date(2026, 11, 15)), (date(2026, 11, 2), date(2026, 11, 8)))


class WeekPeriodParamsTest(SimpleTestCase):
    @mock.patch("analytics.queries.timezone.localdate", return_value=date(2026, 11, 12))
    def test_week_periods_end_last_sunday(self, _today):
        p = parse_filter_params({"period": "12w"})
        self.assertEqual((p["dfrom"], p["dto"]), ("2026-08-17", "2026-11-08"))
        p = parse_filter_params({"period": "1w"})
        self.assertEqual((p["dfrom"], p["dto"]), ("2026-11-02", "2026-11-08"))

    def test_explicit_dates_win_over_period(self):
        p = parse_filter_params({"period": "4w", "date_from": "2026-01-01", "date_to": "2026-02-01"})
        self.assertEqual((p["dfrom"], p["dto"]), ("2026-01-01", "2026-02-01"))

    def test_bucket_defaults_to_month_and_rejects_unknown_values(self):
        self.assertEqual(parse_filter_params({})["bucket"], "month")
        self.assertEqual(parse_filter_params({"bucket": "fortnight"})["bucket"], "month")
        self.assertEqual(parse_filter_params({"bucket": "week"})["bucket"], "week")


class BucketStartTest(SimpleTestCase):
    def test_week_month_quarter(self):
        d = date(2026, 11, 12)  # Thursday
        self.assertEqual(bucket_start(d, "week"), date(2026, 11, 9))
        self.assertEqual(bucket_start(d, "month"), date(2026, 11, 1))
        self.assertEqual(bucket_start(d, "quarter"), date(2026, 10, 1))
