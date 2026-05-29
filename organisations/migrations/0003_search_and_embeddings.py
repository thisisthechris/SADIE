from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import migrations
from pgvector.django import VectorField


class _SkipNonPostgres:
    """Mixin: silently skip DDL that requires PostgreSQL (e.g. under SQLite in tests)."""

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor == "postgresql":
            super().database_forwards(app_label, schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor == "postgresql":
            super().database_backwards(app_label, schema_editor, from_state, to_state)


class _PgAddIndex(_SkipNonPostgres, migrations.AddIndex):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("organisations", "0002_organisation_slug"),
        ("embeddings", "0001_extensions"),
    ]

    operations = [
        migrations.AddField(
            model_name="organisation",
            name="search_vector",
            field=SearchVectorField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="organisation",
            name="embedding",
            field=VectorField(blank=True, dimensions=384, null=True),
        ),
        _PgAddIndex(
            model_name="organisation",
            index=GinIndex(fields=["search_vector"], name="org_search_vector_gin"),
        ),
    ]
