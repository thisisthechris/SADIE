from django.apps import AppConfig


class EmbeddingsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "embeddings"

    def ready(self):
        # Wire post_save handlers that enqueue Celery embed tasks.
        from . import signals  # noqa: F401
