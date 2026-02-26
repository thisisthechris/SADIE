from django.core.exceptions import ValidationError
from django.db import models
from organisations.models import Organisation, Location


class Event(models.Model):
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="events"
    )
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_datetime"]

    def __str__(self):
        return f"{self.title} - {self.organisation.name}"

    def clean(self):
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError(
                {"end_datetime": "End datetime must be after start datetime."}
            )
