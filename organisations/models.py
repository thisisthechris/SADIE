from django.core.validators import RegexValidator
from django.db import models as _db_models

try:
    from django.contrib.gis.db import models

    _HAS_GIS = True
except Exception:
    models = _db_models
    _HAS_GIS = False

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
    website = models.URLField(blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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
