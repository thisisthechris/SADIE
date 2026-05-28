from django.db import migrations, models
from django.utils.text import slugify


def backfill_slugs(apps, schema_editor):
    Organisation = apps.get_model("organisations", "Organisation")
    used: set[str] = set()
    for org in Organisation.objects.all().order_by("pk"):
        base = slugify(org.name) or f"org-{org.pk}"
        candidate = base
        n = 2
        while candidate in used or Organisation.objects.filter(slug=candidate).exclude(pk=org.pk).exists():
            candidate = f"{base}-{n}"
            n += 1
        org.slug = candidate
        org.save(update_fields=["slug"])
        used.add(candidate)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("organisations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="organisation",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_slugs, noop),
        migrations.AlterField(
            model_name="organisation",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
