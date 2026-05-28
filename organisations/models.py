from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models as _db_models
from django.urls import reverse
from django.utils.text import slugify

try:
    from django.contrib.gis.db import models

    _HAS_GIS = True
except Exception:
    models = _db_models
    _HAS_GIS = False

try:
    from django.contrib.postgres.search import SearchVectorField
    from django.contrib.postgres.indexes import GinIndex

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


def _unique_slug(instance, source: str) -> str:
    """Return a slug derived from `source` that is unique for the model."""
    base = slugify(source) or "org"
    Model = type(instance)
    candidate = base
    n = 2
    qs = Model.objects.exclude(pk=instance.pk) if instance.pk else Model.objects.all()
    while qs.filter(slug=candidate).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate

# Validator used only when the GIS fallback CharField stores coordinates as "lng,lat"
_POINT_VALIDATOR = RegexValidator(
    r"^-?\d+(\.\d+)?,-?\d+(\.\d+)?$",
    "Enter a valid point as 'longitude,latitude' (e.g. '-0.1278,51.5074').",
)


def _point_field():
    """Return a PointField when GeoDjango/GDAL is available, else a plain CharField."""
    if _HAS_GIS:
        return models.PointField(null=True, blank=True, srid=4326)
    return _db_models.CharField(max_length=100, blank=True, validators=[_POINT_VALIDATOR])


class Organisation(_db_models.Model):
    name = models.CharField(max_length=255)
    slug = _db_models.SlugField(max_length=255, unique=True, blank=True)
    website = models.URLField(blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    is_partner = _db_models.BooleanField(default=False, db_index=True)
    parent = _db_models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=_db_models.SET_NULL,
        related_name="children",
        limit_choices_to={"parent__isnull": True},
    )
    members = _db_models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="member_organisations",
    )

    if _HAS_PG_SEARCH:
        search_vector = SearchVectorField(null=True, blank=True)
    if _HAS_PGVECTOR:
        embedding = VectorField(dimensions=384, null=True, blank=True)

    class Meta:
        ordering = ["-is_partner", "name"]
        indexes = (
            [GinIndex(fields=["search_vector"], name="org_search_vector_gin")]
            if _HAS_PG_SEARCH
            else []
        )

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.parent_id is not None:
            if self.pk and self.parent_id == self.pk:
                raise ValidationError({"parent": "An organisation cannot be its own parent."})
            # Enforce a flat 1-level hierarchy: parent must itself be top-level.
            parent = self.parent
            if parent and parent.parent_id is not None:
                raise ValidationError(
                    {"parent": "Sub-organisations cannot themselves have a parent (1-level hierarchy)."}
                )
            # If this org already has children, it cannot also be a child.
            if self.pk and type(self).objects.filter(parent_id=self.pk).exists():
                raise ValidationError(
                    {"parent": "This organisation already has sub-organisations and cannot be made a sub-org."}
                )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(self, self.name)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("dashboard-org-events-ics", args=[self.slug])


def org_and_descendants_ids(org_id: int) -> list[int]:
    """Return [org_id, *direct_children_ids]. Flat 1-level hierarchy."""
    if not org_id:
        return []
    child_ids = list(
        Organisation.objects.filter(parent_id=org_id).values_list("id", flat=True)
    )
    return [org_id, *child_ids]


class Location(_db_models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name="locations")
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    postcode = _db_models.CharField(max_length=10, blank=True, db_index=True)
    point = _point_field()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.organisation.name})"
