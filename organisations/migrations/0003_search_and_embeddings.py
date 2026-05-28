from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import migrations
from pgvector.django import VectorField


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
        migrations.AddIndex(
            model_name="organisation",
            index=GinIndex(fields=["search_vector"], name="org_search_vector_gin"),
        ),
    ]
