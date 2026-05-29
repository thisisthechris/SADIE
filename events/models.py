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
    categories = models.ManyToManyField(Category, blank=True, related_name="events")
    source_tags = models.JSONField(default=list, blank=True)
    image_url = models.URLField(blank=True, max_length=500)
    source_url = models.URLField(blank=True, max_length=500)
    external_id = models.CharField(max_length=100, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    if _HAS_PG_SEARCH:
        search_vector = SearchVectorField(null=True, blank=True)
    if _HAS_PGVECTOR:
        embedding = VectorField(dimensions=384, null=True, blank=True)

    class Meta:
        ordering = ["start_datetime"]
        indexes = [GinIndex(fields=["search_vector"], name="event_search_vector_gin")] if _HAS_PG_SEARCH else []

    def __str__(self):
        return f"{self.title} - {self.organisation.name}"

    def clean(self):
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError({"end_datetime": "End datetime must be after start datetime."})
