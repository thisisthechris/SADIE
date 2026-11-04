from django.db import migrations, models


class Migration(migrations.Migration):
    """Promote Event.categories to an explicit through model with a ``source``.

    The through model reuses the existing auto-created join table, so the
    state change needs no database work; only the new column is added.
    Existing links default to "partner", which is how most categories arrive.
    """

    dependencies = [
        ("events", "0004_add_performance_indexes"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="EventCategory",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        (
                            "category",
                            models.ForeignKey(on_delete=models.deletion.CASCADE, to="events.category"),
                        ),
                        (
                            "event",
                            models.ForeignKey(on_delete=models.deletion.CASCADE, to="events.event"),
                        ),
                    ],
                    options={
                        "db_table": "events_event_categories",
                        "unique_together": {("event", "category")},
                        "verbose_name": "event category",
                        "verbose_name_plural": "event categories",
                    },
                ),
                migrations.AlterField(
                    model_name="event",
                    name="categories",
                    field=models.ManyToManyField(
                        blank=True,
                        related_name="events",
                        through="events.EventCategory",
                        to="events.category",
                    ),
                ),
            ],
            database_operations=[],
        ),
        migrations.AddField(
            model_name="eventcategory",
            name="source",
            field=models.CharField(
                choices=[
                    ("partner", "Tagged by partner"),
                    ("auto", "Automatic (keyword rules)"),
                    ("manual", "Set by staff"),
                ],
                db_index=True,
                default="partner",
                max_length=10,
            ),
        ),
    ]
