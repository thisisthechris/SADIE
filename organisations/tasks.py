"""
Celery tasks for generating synthetic analytics data.
For development and testing environments only.
"""

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task
def generate_daily_synthetic_analytics():
    """
    Generate synthetic user journey and postcode analytics data.
    Simulates daily user activity for development/testing environments.

    NOTE: This is for dev/testing only. Do NOT run in production.
    """
    try:
        # Generate moderate amount of synthetic interactions
        # (no new events since those come from scraping)
        call_command(
            "generate_synthetic_data",
            events=0,  # Don't create new events
            interactions=200,  # Moderate user journey data
            postcodes=50,  # Moderate postcode analytics
            verbosity=1,
        )
        logger.info("Generated daily synthetic analytics data")
        return "success"
    except Exception as exc:
        logger.exception("Failed to generate synthetic analytics: %s", exc)
        raise
