from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

from organisations.models import Location, Organisation

try:
    from django.contrib.postgres.indexes import GinIndex
    from django.contrib.postgres.search import SearchVectorField

    _HAS_PG_SEARCH = True
except Exception:  # pragma: no cover
    SearchVectorField = None
    GinIndex = None
    _HAS_PG_SEARCH = False

try:
    from pgvector.django import VectorField

    _HAS_PGVECTOR = True
except Exception:  # pragma: no cover
    VectorField = None
    _HAS_PGVECTOR = False


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Event(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField(null=True, blank=True)
    url = models.URLField(blank=True)
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="events",
    )
    categories = models.ManyToManyField(Category, blank=True, related_name="events", through="EventCategory")
    source_tags = models.JSONField(default=list, blank=True)
    image_url = models.URLField(blank=True, max_length=500)
    source_url = models.URLField(blank=True, max_length=500)
    external_id = models.CharField(max_length=100, blank=True, db_index=True)
    # None means the source didn't say; only imports with price data set these.
    is_free = models.BooleanField(null=True, blank=True, db_index=True)
    price = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, help_text="Lowest paid ticket price seen."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    if _HAS_PG_SEARCH:
        search_vector = SearchVectorField(null=True, blank=True)
    if _HAS_PGVECTOR:
        embedding = VectorField(dimensions=384, null=True, blank=True)

    class Meta:
        ordering = ["start_datetime"]
        indexes = ([GinIndex(fields=["search_vector"], name="event_search_vector_gin")] if _HAS_PG_SEARCH else []) + [
            models.Index(fields=["start_datetime"]),
            models.Index(fields=["organisation", "start_datetime"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.title} - {self.organisation.name}"

    def clean(self):
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError({"end_datetime": "End datetime must be after start datetime."})


class EventCategory(models.Model):
    """Links an event to a category and records how that category was assigned."""

    class Source(models.TextChoices):
        PARTNER = "partner", "Tagged by partner"
        AUTO = "auto", "Automatic (keyword rules)"
        MANUAL = "manual", "Set by staff"

    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.PARTNER, db_index=True)

    class Meta:
        # Reuses the table Django created for the original auto many-to-many.
        db_table = "events_event_categories"
        unique_together = [("event", "category")]
        verbose_name = "event category"
        verbose_name_plural = "event categories"

    def __str__(self):
        return f"{self.category} ({self.get_source_display()})"

    @classmethod
    def source_from_raw(cls, value) -> str:
        """Map a stored source marker to a valid Source, defaulting to partner-tagged."""
        return value if value in cls.Source.values else cls.Source.PARTNER
