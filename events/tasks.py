import logging

import requests
from bs4 import BeautifulSoup
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def scrape_organisation_events(organisation_id):
    """
    Base scraping task. Each organisation requires a custom implementation due to
    differing website structures — extend or override this task for each org.

    WARNING: This placeholder logs a warning and returns without scraping.
    Create a custom task (see scrape_example_org_events below) for each
    organisation and register it instead of calling this base task.
    """
    from organisations.models import Organisation

    try:
        org = Organisation.objects.get(pk=organisation_id)
        logger.warning(
            "scrape_organisation_events called for '%s' (id=%s) but no custom "
            "scraper is implemented. Override this task with an org-specific "
            "implementation.",
            org.name,
            organisation_id,
        )
        return f"No scraper implemented for {org.name}"
    except Organisation.DoesNotExist:
        logger.error("Organisation %s not found", organisation_id)
        return None


@shared_task
def scrape_all_organisations():
    """Periodic task: dispatches a scraping sub-task for every organisation."""
    from organisations.models import Organisation

    org_ids = list(Organisation.objects.values_list("id", flat=True))
    for org_id in org_ids:
        scrape_organisation_events.delay(org_id)
    logger.info("Dispatched scraping for %d organisations", len(org_ids))
    return f"Dispatched scraping for {len(org_ids)} organisations"


@shared_task
def scrape_example_org_events(organisation_id):
    """
    Example custom scraper for an organisation whose events page lists
    events in <article class="event"> tags with h2 title and time elements.
    """
    import dateutil.parser
    from django.utils import timezone

    from events.models import Event
    from organisations.models import Organisation

    try:
        org = Organisation.objects.get(pk=organisation_id)
        response = requests.get(org.website + "/events", timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        created = 0
        for article in soup.select("article.event"):
            title_el = article.find("h2")
            time_el = article.find("time")
            if not title_el or not time_el:
                continue
            title = title_el.get_text(strip=True)
            start_raw = time_el.get("datetime") or time_el.get_text(strip=True)
            try:
                start_dt = dateutil.parser.parse(start_raw)
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt)
            except (ValueError, OverflowError):
                continue
            link_el = article.find("a", href=True)
            url = link_el["href"] if link_el else ""
            _, was_created = Event.objects.get_or_create(
                organisation=org,
                title=title,
                start_datetime=start_dt,
                defaults={"url": url},
            )
            if was_created:
                created += 1
        logger.info("Created %d new events for %s", created, org.name)
        return f"Created {created} events for {org.name}"
    except Organisation.DoesNotExist:
        logger.error("Organisation %s not found", organisation_id)
        return None
    except requests.RequestException as exc:
        logger.error("HTTP error scraping %s: %s", organisation_id, exc)
        return None
