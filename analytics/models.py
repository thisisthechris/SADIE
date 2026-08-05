from django.db import models

from events.models import Event
from organisations.models import Location, Organisation


class UserHashInteraction(models.Model):
    INTERACTION_TYPES = [
        ("event", "Event"),
        ("location", "Location"),
    ]

    user_hash = models.CharField(max_length=64, db_index=True)
    interaction_type = models.CharField(max_length=20, choices=INTERACTION_TYPES)
    event = models.ForeignKey(
        Event,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="interactions",
    )
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="interactions",
    )
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="interactions",
    )
    interaction_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-interaction_date"]
        indexes = [
            models.Index(fields=["user_hash", "interaction_date"]),
        ]

    def __str__(self):
        return f"{self.user_hash[:8]}… {self.interaction_type} on {self.interaction_date}"


class PostcodeAreaInteraction(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="postcode_interactions",
    )
    postcode = models.CharField(max_length=10, db_index=True)
    area = models.CharField(max_length=100, blank=True)
    interaction_count = models.PositiveIntegerField(default=0)
    period_start = models.DateField()
    period_end = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end", "-interaction_count"]
        indexes = [
            models.Index(fields=["postcode", "period_start", "period_end"]),
        ]

    def __str__(self):
        return f"{self.postcode} ({self.organisation.name}) {self.period_start}–{self.period_end}"


class PostcodeEventInteraction(models.Model):
    """Count of users from a postcode who interacted with a venue via an event.

    A separate dataset from :class:`UserHashInteraction` (which tracks individual
    anonymised users). Here each row is an *aggregate* cohort: ``interaction_count``
    users from ``postcode`` who interacted with ``event`` (and therefore its venue).

    Ordering a postcode's rows by ``interaction_date`` yields an ordered sequence
    of venue visits, so consecutive events form venue→venue connections — mirroring
    the user-journey model but for postcode cohorts.
    """

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="postcode_event_interactions",
    )
    postcode = models.CharField(max_length=10, db_index=True)
    area = models.CharField(max_length=100, blank=True)
    event = models.ForeignKey(
        Event,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="postcode_interactions",
    )
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="postcode_event_interactions",
    )
    interaction_count = models.PositiveIntegerField(default=0)
    interaction_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-interaction_date", "-interaction_count"]
        indexes = [
            models.Index(fields=["postcode", "interaction_date"]),
        ]

    def __str__(self):
        return f"{self.postcode} × {self.interaction_count} on {self.interaction_date}"


class PostcodeTicketPurchase(models.Model):
    """A single ticket purchase: how many tickets were bought for an event, from a postcode.

    A separate dataset from :class:`PostcodeEventInteraction` (which counts an
    *aggregate cohort of people* who interacted with an event). Here each row is
    one transaction: ``ticket_quantity`` tickets bought in a single purchase by
    someone from ``postcode`` for ``event``. This enables ticket-volume metrics
    (e.g. average party size, group-booking distribution) that a people-count
    aggregate can't express, since one purchase can cover several tickets.
    """

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="postcode_ticket_purchases",
    )
    postcode = models.CharField(max_length=10, db_index=True)
    area = models.CharField(max_length=100, blank=True)
    event = models.ForeignKey(
        Event,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="postcode_ticket_purchases",
    )
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="postcode_ticket_purchases",
    )
    ticket_quantity = models.PositiveIntegerField(default=1)
    purchase_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-purchase_date"]
        indexes = [
            models.Index(fields=["postcode", "purchase_date"]),
        ]

    def __str__(self):
        return f"{self.postcode} × {self.ticket_quantity} tickets on {self.purchase_date}"


class PostcodeGeo(models.Model):
    """Geocoding cache for UK postcodes using postcodes.io.

    Stores lat/lng for normalized postcodes to avoid repeated API lookups.
    Supports full postcodes (PL4 0AB), sectors (PL4 0), and outward codes (PL4).
    """

    STATUS_CHOICES = [
        ("pending", "Pending geocoding"),
        ("success", "Successfully geocoded"),
        ("failed", "Geocoding failed (will not retry)"),
    ]

    postcode = models.CharField(max_length=10, unique=True, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    geocoded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["postcode"]
        indexes = [
            models.Index(fields=["status", "updated_at"]),
        ]

    def __str__(self):
        status_icon = {"success": "✓", "failed": "✗", "pending": "?"}.get(self.status, "?")
        if self.latitude is not None and self.longitude is not None:
            return f"{self.postcode} {status_icon} ({self.latitude:.4f}, {self.longitude:.4f})"
        return f"{self.postcode} {status_icon}"


class DailyWeather(models.Model):
    """Daily historical weather for Plymouth, backfilled from Open-Meteo's free
    historical-weather API (no key required) — see
    ``analytics/management/commands/backfill_weather.py``.

    Powers the Trends page's weather-vs-attendance correlation chart. One row
    per calendar day; ``weather_code`` follows the WMO code table used by
    Open-Meteo (e.g. 0=clear, 61-65=rain, 71-77=snow).
    """

    date = models.DateField(unique=True, db_index=True)
    temp_max_c = models.FloatField(null=True, blank=True)
    temp_min_c = models.FloatField(null=True, blank=True)
    precipitation_mm = models.FloatField(null=True, blank=True)
    weather_code = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.date} (max {self.temp_max_c}°C, {self.precipitation_mm}mm)"
