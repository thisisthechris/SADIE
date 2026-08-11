from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("analytics", "0005_dailyweather"),
    ]

    operations = [
        migrations.AddField(
            model_name="dailyweather",
            name="wind_speed_ms",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="dailyweather",
            name="sunshine_hours",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
