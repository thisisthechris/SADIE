# Generated migration for performance optimization indexes
# Phase 2: Database query optimization by adding strategic indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0008_orgreportsubscription_anomalyalert_and_more'),
    ]

    operations = [
        # UserHashInteraction: Add single-column index on interaction_date for timeseries queries
        # Complements existing (user_hash, interaction_date) composite index
        migrations.AddIndex(
            model_name='userhashinteraction',
            index=models.Index(
                fields=['interaction_date'],
                name='analytics_userhashinteraction_interaction_date_idx'
            ),
        ),

        # PostcodeAreaInteraction: Add index on period_start for month-based aggregations
        # Complements existing (postcode, period_start, period_end) composite index
        migrations.AddIndex(
            model_name='postcodeareainteraction',
            index=models.Index(
                fields=['period_start'],
                name='analytics_postcodeareainteraction_period_start_idx'
            ),
        ),

        # PostcodeAreaInteraction: Add composite index for efficient month+postcode queries
        migrations.AddIndex(
            model_name='postcodeareainteraction',
            index=models.Index(
                fields=['period_start', 'postcode'],
                name='analytics_postcodeareainteraction_period_postcode_idx'
            ),
        ),

        # PostcodeEventInteraction: Add index on area for area-based aggregations
        migrations.AddIndex(
            model_name='postcodeeventinteraction',
            index=models.Index(
                fields=['area'],
                name='analytics_postcodeeventinteraction_area_idx'
            ),
        ),

        # PostcodeEventInteraction: Add composite index for area+date queries
        migrations.AddIndex(
            model_name='postcodeeventinteraction',
            index=models.Index(
                fields=['area', 'interaction_date'],
                name='analytics_postcodeeventinteraction_area_date_idx'
            ),
        ),

        # PostcodeEventInteraction: Add index on interaction_date alone for pure timeseries queries
        migrations.AddIndex(
            model_name='postcodeeventinteraction',
            index=models.Index(
                fields=['interaction_date'],
                name='analytics_postcodeeventinteraction_interaction_date_idx'
            ),
        ),

        # PostcodeTicketPurchase: Add composite index for ticket volume trend queries
        # Queries: ticket_volume_trend() and peak_times_tickets() filter by purchase_date + event_id
        migrations.AddIndex(
            model_name='postcodeticketpurchase',
            index=models.Index(
                fields=['purchase_date', 'event'],
                name='analytics_postcodeticketpurchase_purchase_event_idx'
            ),
        ),

        # PostcodeTicketPurchase: Add index on event for event-specific ticket aggregations
        migrations.AddIndex(
            model_name='postcodeticketpurchase',
            index=models.Index(
                fields=['event'],
                name='analytics_postcodeticketpurchase_event_idx'
            ),
        ),

        # PostcodeTicketPurchase: Add index on purchase_date for date range scans
        migrations.AddIndex(
            model_name='postcodeticketpurchase',
            index=models.Index(
                fields=['purchase_date'],
                name='analytics_postcodeticketpurchase_purchase_date_idx'
            ),
        ),
    ]
