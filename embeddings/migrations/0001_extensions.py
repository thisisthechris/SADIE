# Migration handled by the host apps (events, organisations) so the new fields
# live on those models. This app only enables the postgres extensions.
from django.contrib.postgres.operations import (
    TrigramExtension,
    UnaccentExtension,
)
from django.db import migrations


class CreateVectorExtension(migrations.RunSQL):
    def __init__(self):
        super().__init__(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="DROP EXTENSION IF EXISTS vector;",
        )


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        TrigramExtension(),
        UnaccentExtension(),
        CreateVectorExtension(),
    ]
