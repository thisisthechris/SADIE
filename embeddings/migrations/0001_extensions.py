# Migration handled by the host apps (events, organisations) so the new fields
# live on those models. This app only enables the postgres extensions.
from django.contrib.postgres.operations import (
    TrigramExtension,
    UnaccentExtension,
)
from django.db import migrations


class _SkipNonPostgres:
    """Mixin: silently skip operations that require PostgreSQL (e.g. under SQLite in tests)."""

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor == "postgresql":
            super().database_forwards(app_label, schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor == "postgresql":
            super().database_backwards(app_label, schema_editor, from_state, to_state)


class SafeTrigramExtension(_SkipNonPostgres, TrigramExtension):
    pass


class SafeUnaccentExtension(_SkipNonPostgres, UnaccentExtension):
    pass


class CreateVectorExtension(_SkipNonPostgres, migrations.RunSQL):
    def __init__(self):
        super().__init__(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="DROP EXTENSION IF EXISTS vector;",
        )


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        SafeTrigramExtension(),
        SafeUnaccentExtension(),
        CreateVectorExtension(),
    ]
