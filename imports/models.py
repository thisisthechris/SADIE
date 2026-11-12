from django.conf import settings
from django.db import models

from organisations.models import Organisation


class UploadBatch(models.Model):
    """One CSV file uploaded through the browser upload tool.

    The browser parses and hashes the file; only the allowlisted, PII-free row
    fields ever reach the server (see ``imports.upload_serializers``). Every row
    created from a batch carries ``upload_batch`` so the batch can be undone.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETE = "complete", "Complete"
        UNDONE = "undone", "Undone"

    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name="upload_batches")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="upload_batches"
    )
    source_format = models.CharField(max_length=60)
    # SHA-256 of the file's bytes, computed in the browser, to spot re-uploads.
    file_fingerprint = models.CharField(max_length=64, db_index=True)
    # Original file name, kept only if it doesn't look like personal data.
    file_label = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_PROGRESS)
    row_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    interaction_count = models.PositiveIntegerField(default=0)
    date_from = models.DateField(null=True, blank=True)
    date_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    undone_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "upload batches"

    def __str__(self):
        return f"{self.organisation} · {self.source_format} · {self.created_at:%Y-%m-%d %H:%M} ({self.status})"


class DataUpgrade(models.Model):
    """A one-off data step (e.g. a re-import) already applied by ``apply_data_upgrades``."""

    name = models.CharField(max_length=100, unique=True)
    applied_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.applied_at:%Y-%m-%d %H:%M})"
