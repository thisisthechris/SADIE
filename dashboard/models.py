from django.conf import settings
from django.db import models
from django.utils.crypto import get_random_string
from django.utils.text import slugify


def _gen_slug(base: str) -> str:
    """Deterministic-ish slug with a 6-char suffix to avoid collisions."""
    return f"{slugify(base) or 'view'}-{get_random_string(6).lower()}"


class SavedView(models.Model):
    """A persisted SPA view: a path + filter querystring + optional public slug."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_views",
    )
    name = models.CharField(max_length=120)
    path = models.CharField(
        max_length=255,
        help_text="SPA route, e.g. '/app/map3d' or '/app/postcodes3d'.",
    )
    query_string = models.TextField(
        blank=True,
        help_text="URL-encoded filter querystring, no leading '?'.",
    )
    is_public = models.BooleanField(default=False)
    slug = models.SlugField(max_length=64, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="unique_savedview_user_name"),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _gen_slug(self.name)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} ({self.user_id})"
