from django.conf import settings
from django.db import models

from events.models import Event
from organisations.models import Location, Organisation


class ScrapeSource(models.Model):
    """Configuration for a scrape target (e.g. Plymouth Culture)."""

    name = models.CharField(max_length=255, unique=True)
    base_url = models.URLField(help_text="Base URL of the site, e.g. https://www.plymouthculture.co.uk")
    api_path = models.CharField(
        max_length=255,
        blank=True,
        help_text="Path to the events API/page, e.g. /events-1",
    )
    scraper_task_name = models.CharField(
        max_length=255,
        help_text="Dotted path to the Celery task, e.g. scraping.tasks.scrape_plymouth_culture",
    )
    enabled = models.BooleanField(default=True)
    scrape_interval_hours = models.PositiveIntegerField(default=24)
    last_scraped_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ScrapeRun(models.Model):
    """Logs each execution of a scrape."""

    STATUS_CHOICES = [
        ("running", "Running"),
        ("success", "Success"),
        ("failed", "Failed"),
    ]

    source = models.ForeignKey(ScrapeSource, on_delete=models.CASCADE, related_name="runs")
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="running")
    events_found = models.PositiveIntegerField(default=0)
    events_created = models.PositiveIntegerField(default=0)
    events_updated = models.PositiveIntegerField(default=0)
    events_skipped = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.source.name} – {self.started_at:%Y-%m-%d %H:%M} ({self.status})"


class ImportedEvent(models.Model):
    """Staging table for scraped events awaiting human review."""

    STATUS_CHOICES = [
        ("pending", "Pending Review"),
        ("auto_matched", "Auto-Matched"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("imported", "Imported"),
    ]

    # Source tracking
    source = models.ForeignKey(ScrapeSource, on_delete=models.CASCADE, related_name="imported_events")
    scrape_run = models.ForeignKey(ScrapeRun, on_delete=models.CASCADE, related_name="imported_events")
    external_id = models.CharField(max_length=100, db_index=True)
    raw_data = models.JSONField(default=dict, blank=True, help_text="Full JSON from the source API")

    # Extracted event data
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    start_datetime = models.DateTimeField(null=True, blank=True)
    end_datetime = models.DateTimeField(null=True, blank=True)
    source_url = models.URLField(blank=True, max_length=500)
    image_url = models.URLField(blank=True, max_length=500)

    # Venue info (raw from source)
    venue_name = models.CharField(max_length=255, blank=True)
    venue_address = models.TextField(blank=True)
    venue_postcode = models.CharField(max_length=10, blank=True)
    venue_lat = models.FloatField(null=True, blank=True)
    venue_lng = models.FloatField(null=True, blank=True)

    # Categories and tags (raw from source)
    categories_raw = models.JSONField(default=list, blank=True)
    tags_raw = models.JSONField(default=list, blank=True)

    # Review / matching fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    matched_event = models.ForeignKey(
        Event,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="import_matches",
        help_text="Existing event this was matched to (for updates/dedup)",
    )
    matched_organisation = models.ForeignKey(
        Organisation,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="import_matches",
    )
    matched_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="import_matches",
    )
    review_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_imports",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"],
                name="unique_source_external_id",
            ),
        ]

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title}"
