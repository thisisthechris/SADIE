"""Backfill daily historical weather for Plymouth from Open-Meteo's free
historical-weather API (no API key required).

This is a one-off backfill for the test/demo environment (not a live daily
sync job) — run it once after seeding event/interaction data, or re-run any
time to top up newly-imported date ranges.

Usage:
    python manage.py backfill_weather
    python manage.py backfill_weather --start 2025-01-01 --end 2026-06-30
    python manage.py backfill_weather --force   # re-fetch dates we already have
"""

from __future__ import annotations

from datetime import date, datetime

import requests
from django.core.management.base import BaseCommand, CommandError

from analytics.models import DailyWeather, PostcodeTicketPurchase, UserHashInteraction
from events.models import Event

# Plymouth city centre — close enough for city-wide weather correlation;
# this is not meant to capture microclimates between venues.
PLYMOUTH_LAT = 50.3755
PLYMOUTH_LNG = -4.1427

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT = 30


class Command(BaseCommand):
    help = "Backfill DailyWeather from Open-Meteo's free historical-weather API for Plymouth."

    def add_arguments(self, parser):
        parser.add_argument(
            "--start",
            type=str,
            default=None,
            help="Start date (YYYY-MM-DD). Default: earliest event/interaction/ticket date on record.",
        )
        parser.add_argument(
            "--end",
            type=str,
            default=None,
            help="End date (YYYY-MM-DD). Default: today (Open-Meteo's archive has no future data).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-fetch and overwrite dates that already have a DailyWeather row.",
        )

    def handle(self, *args, **options):
        start = self._parse_date(options["start"]) if options["start"] else self._earliest_data_date()
        end = self._parse_date(options["end"]) if options["end"] else date.today()

        if start is None:
            raise CommandError(
                "No start date given and no Event/UserHashInteraction/PostcodeTicketPurchase rows "
                "exist to infer one — pass --start explicitly."
            )

        today = date.today()
        if end > today:
            self.stdout.write(
                self.style.WARNING(
                    f"Requested end date {end} is in the future — Open-Meteo's archive has no forecast "
                    f"data, capping to today ({today})."
                )
            )
            end = today

        if start > end:
            raise CommandError(f"Start date {start} is after end date {end}.")

        if not options["force"]:
            existing = set(DailyWeather.objects.filter(date__gte=start, date__lte=end).values_list("date", flat=True))
        else:
            existing = set()

        self.stdout.write(f"Fetching Plymouth weather {start} → {end} from Open-Meteo…")
        rows = self._fetch_weather(start, end)

        created = 0
        updated = 0
        skipped = 0
        for row in rows:
            row_date = row["date"]
            if row_date in existing:
                skipped += 1
                continue
            _obj, was_created = DailyWeather.objects.update_or_create(
                date=row_date,
                defaults={
                    "temp_max_c": row["temp_max_c"],
                    "temp_min_c": row["temp_min_c"],
                    "precipitation_mm": row["precipitation_mm"],
                    "weather_code": row["weather_code"],
                    "wind_speed_ms": row["wind_speed_ms"],
                    "sunshine_hours": row["sunshine_hours"],
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Done. {created} created, {updated} updated, {skipped} already present (skipped).")
        )

    @staticmethod
    def _parse_date(value: str) -> date:
        return datetime.strptime(value, "%Y-%m-%d").date()

    @staticmethod
    def _earliest_data_date() -> date | None:
        candidates = []
        first_event = Event.objects.order_by("start_datetime").values_list("start_datetime", flat=True).first()
        if first_event:
            candidates.append(first_event.date())
        first_interaction = (
            UserHashInteraction.objects.order_by("interaction_date").values_list("interaction_date", flat=True).first()
        )
        if first_interaction:
            candidates.append(first_interaction)
        first_ticket = (
            PostcodeTicketPurchase.objects.order_by("purchase_date").values_list("purchase_date", flat=True).first()
        )
        if first_ticket:
            candidates.append(first_ticket)
        return min(candidates) if candidates else None

    def _fetch_weather(self, start: date, end: date) -> list[dict]:
        params = {
            "latitude": PLYMOUTH_LAT,
            "longitude": PLYMOUTH_LNG,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,wind_speed_10m_max,sunshine_duration",
            "timezone": "Europe/London",
        }

        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                resp = requests.get(ARCHIVE_URL, params=params, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                data = resp.json()
                break
            except requests.RequestException as exc:  # pragma: no cover - network dependent
                last_exc = exc
                self.stderr.write(self.style.WARNING(f"Attempt {attempt + 1}/3 failed: {exc}"))
        else:
            raise CommandError(f"Failed to fetch weather data after 3 attempts: {last_exc}")

        daily = data.get("daily", {})
        dates = daily.get("time", [])
        temp_max = daily.get("temperature_2m_max", [])
        temp_min = daily.get("temperature_2m_min", [])
        precip = daily.get("precipitation_sum", [])
        codes = daily.get("weathercode", [])
        wind = daily.get("wind_speed_10m_max", [])
        sunshine = daily.get("sunshine_duration", [])  # seconds

        rows = []
        for i, d in enumerate(dates):
            # Open-Meteo gives wind in km/h; convert to m/s for consistency.
            wind_kmh = wind[i] if i < len(wind) else None
            wind_ms = round(wind_kmh / 3.6, 2) if wind_kmh is not None else None
            # sunshine_duration is in seconds; convert to hours.
            sun_secs = sunshine[i] if i < len(sunshine) else None
            sun_hours = round(sun_secs / 3600, 2) if sun_secs is not None else None
            rows.append(
                {
                    "date": self._parse_date(d),
                    "temp_max_c": temp_max[i] if i < len(temp_max) else None,
                    "temp_min_c": temp_min[i] if i < len(temp_min) else None,
                    "precipitation_mm": precip[i] if i < len(precip) else None,
                    "weather_code": codes[i] if i < len(codes) else None,
                    "wind_speed_ms": wind_ms,
                    "sunshine_hours": sun_hours,
                }
            )
        return rows
