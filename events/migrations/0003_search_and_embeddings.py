from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import migrations
from pgvector.django import VectorField


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0002_add_category_and_event_fields"),
        ("embeddings", "0001_extensions"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="search_vector",
            field=SearchVectorField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="embedding",
            field=VectorField(blank=True, dimensions=384, null=True),
        ),
        migrations.AddIndex(
            model_name="event",
            index=GinIndex(fields=["search_vector"], name="event_search_vector_gin"),
        ),
    ]
