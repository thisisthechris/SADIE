from django.contrib.gis.db import models


class Organisation(models.Model):
    name = models.CharField(max_length=255)
    website = models.URLField(blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Location(models.Model):
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="locations"
    )
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    postcode = models.CharField(max_length=10, blank=True, db_index=True)
    point = models.PointField(null=True, blank=True, srid=4326)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.organisation.name})"
