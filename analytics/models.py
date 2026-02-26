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
