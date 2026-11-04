from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0005_eventcategory_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="is_free",
            field=models.BooleanField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="price",
            field=models.DecimalField(
                blank=True, decimal_places=2, help_text="Lowest paid ticket price seen.", max_digits=8, null=True
            ),
        ),
    ]
