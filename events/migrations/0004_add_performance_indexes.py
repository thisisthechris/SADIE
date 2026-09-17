# Generated migration for performance optimization indexes
# Phase 2: Database query optimization by adding strategic indexes to Event model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0003_search_and_embeddings'),
    ]

    operations = [
        # Event: Add index on start_datetime for event filtering by date range
        # Many queries filter events by date_from/date_to using Event.start_datetime
        migrations.AddIndex(
            model_name='event',
            index=models.Index(
                fields=['start_datetime'],
                name='events_event_start_datetime_idx'
            ),
        ),

        # Event: Add composite index on organisation + start_datetime
        # Stats views filter events by organisation AND date range simultaneously
        # This index supports efficient filtering in queries like:
        #   Event.objects.filter(organisation=org, start_datetime__gte=date_from, start_datetime__lte=date_to)
        migrations.AddIndex(
            model_name='event',
            index=models.Index(
                fields=['organisation', 'start_datetime'],
                name='events_event_organisation_datetime_idx'
            ),
        ),

        # Event: Add index on created_at for backfill/import queries
        # Bulk operations often sort by creation time to identify new vs. updated events
        migrations.AddIndex(
            model_name='event',
            index=models.Index(
                fields=['created_at'],
                name='events_event_created_at_idx'
            ),
        ),
    ]
