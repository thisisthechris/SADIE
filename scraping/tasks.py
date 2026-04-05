"""
Celery tasks for scraping external event sources.
"""
import html as html_module
import json
import logging
import re
import time
from datetime import datetime, timezone as dt_tz

import requests
from bs4 import BeautifulSoup
from celery import shared_task
from django.utils import timezone
from html2text import HTML2Text

from .matching import match_existing_event, match_location, match_organisation
from .models import ImportedEvent, ScrapeRun, ScrapeSource

logger = logging.getLogger(__name__)

# Squarespace's default "no location" point (NYC)
_NYC_LAT_RANGE = (40.7, 40.75)
_NYC_LNG_RANGE = (-74.01, -73.99)


def _ms_to_datetime(ms: int | None) -> datetime | None:
    """Convert millisecond epoch timestamp to timezone-aware datetime."""
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=dt_tz.utc)
    except (ValueError, TypeError, OSError):
        return None


def _html_to_text(html: str) -> str:
    """Convert HTML body to clean plain text."""
    if not html:
        return ""
    h = HTML2Text()
    h.ignore_links = False
    h.ignore_images = True
    h.body_width = 0  # no wrapping
    return h.handle(html).strip()


def _extract_squarespace_event(item: dict, base_url: str) -> dict:
    """
    Extract normalised event data from a Squarespace collection item.
    Returns a dict matching ImportedEvent field names.
    """
    # Basic fields
    external_id = item.get("id", "")
    title = item.get("title", "").strip()
    body_html = item.get("body", "")
    description = _html_to_text(body_html)
    full_url = item.get("fullUrl", "")
    source_url = f"{base_url}{full_url}" if full_url else ""

    # Dates
    start_datetime = _ms_to_datetime(item.get("startDate"))
    end_datetime = _ms_to_datetime(item.get("endDate"))

    # Image
    image_url = ""
    if item.get("assetUrl"):
        image_url = item["assetUrl"]

    # Location
    location = item.get("location", {}) or {}
    venue_name = (location.get("addressTitle") or "").strip()
    venue_address = (location.get("addressLine1") or "").strip()
    if location.get("addressLine2"):
        venue_address += f"\n{location['addressLine2'].strip()}"
    if location.get("addressCountry"):
        venue_address += f"\n{location['addressCountry'].strip()}"

    # Extract postcode from address if present (UK postcode pattern)
    venue_postcode = ""
    pc_match = re.search(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b", venue_address, re.IGNORECASE)
    if pc_match:
        venue_postcode = pc_match.group(1).upper()

    venue_lat = location.get("mapLat")
    venue_lng = location.get("mapLng")

    # Filter NYC default coordinates
    if venue_lat and venue_lng:
        if _NYC_LAT_RANGE[0] < venue_lat < _NYC_LAT_RANGE[1] and _NYC_LNG_RANGE[0] < venue_lng < _NYC_LNG_RANGE[1]:
            venue_lat = None
            venue_lng = None

    # Categories and tags (Squarespace returns these as plain string lists)
    categories_raw = [c for c in (item.get("categories") or []) if isinstance(c, str) and c.strip()]
    tags_raw = [t for t in (item.get("tags") or []) if isinstance(t, str) and t.strip()]

    return {
        "external_id": external_id,
        "title": title,
        "description": description,
        "start_datetime": start_datetime,
        "end_datetime": end_datetime,
        "source_url": source_url,
        "image_url": image_url,
        "venue_name": venue_name,
        "venue_address": venue_address,
        "venue_postcode": venue_postcode,
        "venue_lat": venue_lat,
        "venue_lng": venue_lng,
        "categories_raw": categories_raw,
        "tags_raw": tags_raw,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def scrape_plymouth_culture(self, source_id: int):
    """
    Scrape events from Plymouth Culture's Squarespace JSON API.
    Paginates through all results and upserts ImportedEvent records.
    """
    try:
        source = ScrapeSource.objects.get(pk=source_id)
    except ScrapeSource.DoesNotExist:
        logger.error("ScrapeSource %s does not exist", source_id)
        return

    run = ScrapeRun.objects.create(source=source)
    base_url = source.base_url.rstrip("/")
    api_path = source.api_path or "/events-1"
    page_url = f"{base_url}{api_path}?format=json"

    session = requests.Session()
    session.headers.update({"User-Agent": "SADIE Event Scraper/1.0"})

    events_found = 0
    events_created = 0
    events_updated = 0
    events_skipped = 0

    try:
        while page_url:
            logger.info("Fetching %s", page_url)
            resp = session.get(page_url, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            # Squarespace events API: items are under 'upcoming' and 'past', not 'items'
            items = data.get("upcoming", []) + data.get("past", [])
            if not items:
                break

            events_found += len(items)

            for item in items:
                extracted = _extract_squarespace_event(item, base_url)

                if not extracted["external_id"] or not extracted["title"]:
                    events_skipped += 1
                    continue

                # Upsert into ImportedEvent
                ie, created = ImportedEvent.objects.update_or_create(
                    source=source,
                    external_id=extracted["external_id"],
                    defaults={
                        "scrape_run": run,
                        "raw_data": item,
                        "title": extracted["title"],
                        "description": extracted["description"],
                        "start_datetime": extracted["start_datetime"],
                        "end_datetime": extracted["end_datetime"],
                        "source_url": extracted["source_url"],
                        "image_url": extracted["image_url"],
                        "venue_name": extracted["venue_name"],
                        "venue_address": extracted["venue_address"],
                        "venue_postcode": extracted["venue_postcode"],
                        "venue_lat": extracted["venue_lat"],
                        "venue_lng": extracted["venue_lng"],
                        "categories_raw": extracted["categories_raw"],
                        "tags_raw": extracted["tags_raw"],
                    },
                )

                if created:
                    events_created += 1
                    # Auto-match on new imports
                    ie.matched_organisation = match_organisation(extracted["venue_name"])
                    ie.matched_location = match_location(
                        extracted["venue_name"],
                        extracted["venue_postcode"],
                        ie.matched_organisation,
                    )
                    ie.matched_event = match_existing_event(extracted["external_id"], source.pk)

                    if ie.matched_event:
                        ie.status = "auto_matched"
                    elif ie.matched_organisation:
                        ie.status = "auto_matched"

                    ie.save()
                else:
                    events_updated += 1
                    # Don't overwrite status if already reviewed
                    if ie.status in ("pending",):
                        ie.matched_organisation = match_organisation(extracted["venue_name"])
                        ie.matched_location = match_location(
                            extracted["venue_name"],
                            extracted["venue_postcode"],
                            ie.matched_organisation,
                        )
                        if ie.matched_organisation:
                            ie.status = "auto_matched"
                        ie.save()

            # Pagination: Squarespace uses &offset= with the last item's pubDate
            pagination = data.get("pagination", {})
            if pagination.get("nextPage"):
                next_offset = pagination["nextPageOffset"]
                page_url = f"{base_url}{api_path}?format=json&offset={next_offset}"
            else:
                page_url = None

        # Finish successfully
        run.status = "success"
        run.events_found = events_found
        run.events_created = events_created
        run.events_updated = events_updated
        run.events_skipped = events_skipped
        run.finished_at = timezone.now()
        run.save()

        source.last_scraped_at = timezone.now()
        source.save(update_fields=["last_scraped_at"])

        logger.info(
            "Plymouth Culture scrape complete: %d found, %d new, %d updated, %d skipped",
            events_found,
            events_created,
            events_updated,
            events_skipped,
        )

    except requests.RequestException as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("Plymouth Culture scrape failed: %s", exc)
        raise self.retry(exc=exc)

    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("Plymouth Culture scrape error: %s", exc)
        raise


# ---------------------------------------------------------------------------
#  Theatre Royal Plymouth scraper (HTML)
# ---------------------------------------------------------------------------

_TRP_DATE_RE = re.compile(
    r"(?P<start_day>\d{1,2})\s+(?P<start_mon>[A-Za-z]+)"
    r"(?:\s*[\u2013\-]\s*(?P<end_day>\d{1,2})\s+(?P<end_mon>[A-Za-z]+))?"
    r"\s+(?P<year>\d{4})"
)


def _parse_trp_date_range(date_text: str) -> tuple[datetime | None, datetime | None]:
    """
    Parse TRP date strings like '27 Feb–28 Feb 2026' or '03 Mar 2026'.
    Returns (start_datetime, end_datetime) as UTC-aware datetimes.
    """
    from dateutil import parser as dateutil_parser

    m = _TRP_DATE_RE.search(date_text)
    if not m:
        return None, None

    year = m.group("year")
    start_str = f"{m.group('start_day')} {m.group('start_mon')} {year}"
    try:
        start_dt = dateutil_parser.parse(start_str).replace(tzinfo=dt_tz.utc)
    except (ValueError, TypeError):
        return None, None

    end_dt = None
    if m.group("end_day") and m.group("end_mon"):
        end_str = f"{m.group('end_day')} {m.group('end_mon')} {year}"
        try:
            end_dt = dateutil_parser.parse(end_str).replace(tzinfo=dt_tz.utc)
        except (ValueError, TypeError):
            pass

    return start_dt, end_dt


def _extract_trp_card(card, base_url: str) -> dict | None:
    """Extract event data from a .c-event-card BeautifulSoup element."""
    link = card.select_one("a[href]")
    if not link:
        return None

    url = link["href"]
    slug = url.rstrip("/").split("/")[-1]
    if not slug:
        return None

    title_el = card.select_one(".c-event-card__title")
    date_el = card.select_one(".c-event-card__date")
    venue_el = card.select_one(".c-event-card__venue")

    title = title_el.get_text(strip=True) if title_el else ""
    date_text = date_el.get_text(strip=True) if date_el else ""
    venue = venue_el.get_text(strip=True) if venue_el else ""

    start_dt, end_dt = _parse_trp_date_range(date_text)

    # Image: pick the largest from data-srcset, else fall back to src
    img_url = ""
    img = card.select_one("img")
    if img:
        srcset = img.get("data-srcset", "")
        if srcset:
            parts = [p.strip().split(" ")[0] for p in srcset.split(",") if p.strip()]
            if parts:
                img_url = parts[-1]  # last (largest)
        if not img_url:
            img_url = img.get("src", "")

    return {
        "external_id": slug,
        "title": title,
        "source_url": url if url.startswith("http") else f"{base_url}{url}",
        "image_url": img_url,
        "start_datetime": start_dt,
        "end_datetime": end_dt,
        "venue_name": venue,
    }


def _fetch_trp_detail(url: str, session: requests.Session) -> dict:
    """Fetch a TRP detail page and extract description + genres."""
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.debug("Failed to fetch TRP detail %s: %s", url, exc)
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")

    # Description: prefer og:description, fall back to first substantial paragraphs
    description = ""
    og_desc = soup.find("meta", attrs={"property": "og:description"})
    if og_desc and og_desc.get("content", "").strip():
        description = og_desc["content"].strip()
    else:
        main = soup.find("main") or soup
        paras = [p.get_text(strip=True) for p in main.find_all("p") if len(p.get_text(strip=True)) > 30]
        description = "\n\n".join(paras[:5])

    # Genres from genre filter links on the page
    genres = []
    for a in soup.find_all("a", href=True):
        if "/genres/" in a["href"]:
            genre = a.get_text(strip=True)
            if genre and genre not in genres:
                genres.append(genre)

    return {
        "description": description,
        "categories_raw": genres,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def scrape_theatre_royal(self, source_id: int):
    """
    Scrape events from Theatre Royal Plymouth's what's-on pages.
    Paginates through all listing pages and fetches each detail page
    for descriptions and genre tags.
    """
    try:
        source = ScrapeSource.objects.get(pk=source_id)
    except ScrapeSource.DoesNotExist:
        logger.error("ScrapeSource %s does not exist", source_id)
        return

    run = ScrapeRun.objects.create(source=source)
    base_url = source.base_url.rstrip("/")
    api_path = source.api_path or "/whats-on/"

    session = requests.Session()
    session.headers.update({"User-Agent": "SADIE Event Scraper/1.0"})

    events_found = 0
    events_created = 0
    events_updated = 0
    events_skipped = 0

    try:
        page = 1
        max_pages = 20  # safety limit

        while page <= max_pages:
            if page == 1:
                page_url = f"{base_url}{api_path}"
            else:
                path = api_path.rstrip("/")
                page_url = f"{base_url}{path}/page/{page}/"

            logger.info("Fetching %s", page_url)
            resp = session.get(page_url, timeout=15)

            if resp.status_code == 404:
                logger.info("Page %d returned 404 — end of listings", page)
                break

            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            cards = soup.select(".c-event-card")

            if not cards:
                logger.info("No cards found on page %d — end of listings", page)
                break

            events_found += len(cards)

            for card in cards:
                extracted = _extract_trp_card(card, base_url)
                if not extracted or not extracted["title"]:
                    events_skipped += 1
                    continue

                # Fetch detail page for description + genres
                detail = _fetch_trp_detail(extracted["source_url"], session)
                # Be polite — small delay between detail page requests
                time.sleep(0.5)

                # Build a JSON-safe copy of extracted for raw_data storage
                raw_data = {
                    k: (v.isoformat() if isinstance(v, datetime) else v)
                    for k, v in extracted.items()
                }

                ie, created = ImportedEvent.objects.update_or_create(
                    source=source,
                    external_id=extracted["external_id"],
                    defaults={
                        "scrape_run": run,
                        "raw_data": raw_data,
                        "title": extracted["title"],
                        "description": detail.get("description", ""),
                        "start_datetime": extracted["start_datetime"],
                        "end_datetime": extracted["end_datetime"],
                        "source_url": extracted["source_url"],
                        "image_url": extracted["image_url"],
                        "venue_name": extracted["venue_name"],
                        "venue_address": "Royal Parade, Plymouth",
                        "venue_postcode": "PL1 2TR",
                        "categories_raw": detail.get("categories_raw", []),
                        "tags_raw": [],
                    },
                )

                if created:
                    events_created += 1
                    ie.matched_organisation = match_organisation(
                        extracted["venue_name"] or "Theatre Royal Plymouth"
                    )
                    ie.matched_location = match_location(
                        extracted["venue_name"] or "Theatre Royal Plymouth",
                        "PL1 2TR",
                        ie.matched_organisation,
                    )
                    ie.matched_event = match_existing_event(extracted["external_id"], source.pk)
                    if ie.matched_event or ie.matched_organisation:
                        ie.status = "auto_matched"
                    ie.save()
                else:
                    events_updated += 1
                    if ie.status == "pending":
                        ie.matched_organisation = match_organisation(
                            extracted["venue_name"] or "Theatre Royal Plymouth"
                        )
                        if ie.matched_organisation:
                            ie.status = "auto_matched"
                            ie.save()

            page += 1

        run.status = "success"
        run.events_found = events_found
        run.events_created = events_created
        run.events_updated = events_updated
        run.events_skipped = events_skipped
        run.finished_at = timezone.now()
        run.save()

        source.last_scraped_at = timezone.now()
        source.save(update_fields=["last_scraped_at"])

        logger.info(
            "Theatre Royal Plymouth scrape complete: %d found, %d new, %d updated, %d skipped",
            events_found, events_created, events_updated, events_skipped,
        )

    except requests.RequestException as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("Theatre Royal Plymouth scrape failed: %s", exc)
        raise self.retry(exc=exc)

    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("Theatre Royal Plymouth scrape error: %s", exc)
        raise


# ---------------------------------------------------------------------------
#  The Box Plymouth scraper (HTML + embedded JSON)
# ---------------------------------------------------------------------------


def _extract_box_event_urls(html_text: str) -> list[str]:
    """
    Parse the /events listing page and return unique event detail URLs.
    Cards are <div class="flex flex-col w-1/2 ..."> containing an <a> link
    to a detail page at /events/{category}/{slug}.
    """
    soup = BeautifulSoup(html_text, "html.parser")
    urls: set[str] = set()
    for link in soup.select('a[href*="/events/"]'):
        href = link.get("href", "")
        # Must be a detail page (two path segments after /events/)
        parts = href.rstrip("/").split("/events/")
        if len(parts) == 2 and "/" in parts[1]:
            urls.add(href)
    return sorted(urls)


def _extract_box_event_data(html_text: str, source_url: str) -> dict | None:
    """
    Extract structured event data from a Box Plymouth detail page.
    The page embeds a Vue component <event-slot-table :event-slots="[JSON]">
    containing full event info, slots, categories, and location.
    """
    # Find the :event-slots="..." attribute
    marker = ':event-slots="'
    idx = html_text.find(marker)
    if idx < 0:
        return None

    start = idx + len(marker)
    end = html_text.find('">', start)
    if end < 0:
        return None

    try:
        decoded = html_module.unescape(html_text[start:end])
        slots = json.loads(decoded)
    except (json.JSONDecodeError, ValueError):
        return None

    if not slots:
        return None

    # Event data is the same in every slot — grab from first
    event_data = slots[0].get("event", {})
    if not event_data:
        return None

    event_id = str(event_data.get("id", ""))
    title = event_data.get("title", "").strip()
    short_desc = event_data.get("short_desc", "") or ""
    long_desc = event_data.get("long_desc", "") or ""
    description = short_desc
    if long_desc:
        description = f"{short_desc}\n\n{long_desc}" if short_desc else long_desc

    # Image: try og:image first, fall back to image field
    soup = BeautifulSoup(html_text, "html.parser")
    og_img = soup.find("meta", property="og:image")
    image_url = ""
    if og_img:
        image_url = og_img.get("content", "")
    elif event_data.get("image"):
        image_url = f"https://imagedelivery.net/tbIWbJKEj9qx0hkgQ6WRMA/{event_data['image']}/logo"

    # Location from first slot
    location_title = slots[0].get("locationTitle", "The Box")

    # Categories: filter out month-based categories (e.g. "February 2026")
    categories_raw = []
    for cat in event_data.get("categories", []):
        cat_title = cat.get("title", "")
        # Skip month-year categories
        if re.match(r"^[A-Z][a-z]+ \d{4}$", cat_title):
            continue
        # Skip Journeys with Mai events (topic grouping, not a category)
        if "events" in cat_title.lower() and cat_title not in (
            "Special events",
            "Community Events",
        ):
            continue
        categories_raw.append(cat_title)

    # Date range: earliest start, latest end across all slots
    start_dates = []
    end_dates = []
    for slot in slots:
        if slot.get("start_date"):
            try:
                start_dates.append(
                    datetime.fromisoformat(slot["start_date"].replace("Z", "+00:00"))
                )
            except ValueError:
                pass
        if slot.get("end_date"):
            try:
                end_dates.append(
                    datetime.fromisoformat(slot["end_date"].replace("Z", "+00:00"))
                )
            except ValueError:
                pass

    start_datetime = min(start_dates) if start_dates else None
    end_datetime = max(end_dates) if end_dates else None

    # Work info (opening times etc.)
    work_info = event_data.get("work_info", "") or ""

    return {
        "external_id": event_id,
        "title": title,
        "description": _html_to_text(description) if "<" in description else description,
        "start_datetime": start_datetime,
        "end_datetime": end_datetime,
        "source_url": source_url,
        "image_url": image_url,
        "venue_name": location_title,
        "categories_raw": categories_raw,
        "work_info": work_info,
        "slot_count": len(slots),
        "slots_summary": [
            {
                "title": s.get("title", ""),
                "start": s.get("start_date", ""),
                "end": s.get("end_date", ""),
                "location": s.get("locationTitle", ""),
            }
            for s in slots
        ],
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def scrape_the_box(self, source_id: int):
    """
    Scrape events from The Box Plymouth's events page.
    Fetches the listing page for event URLs, then each detail page
    for structured event data embedded in the event-slot-table component.
    """
    try:
        source = ScrapeSource.objects.get(pk=source_id)
    except ScrapeSource.DoesNotExist:
        logger.error("ScrapeSource %s does not exist", source_id)
        return

    run = ScrapeRun.objects.create(source=source)
    base_url = source.base_url.rstrip("/")
    api_path = source.api_path or "/events"

    session = requests.Session()
    session.headers.update({"User-Agent": "SADIE Event Scraper/1.0"})

    events_found = 0
    events_created = 0
    events_updated = 0
    events_skipped = 0

    try:
        # Step 1: Fetch listing page and extract event URLs
        listing_url = f"{base_url}{api_path}"
        logger.info("Fetching %s", listing_url)
        resp = session.get(listing_url, timeout=15)
        resp.raise_for_status()

        event_urls = _extract_box_event_urls(resp.text)
        events_found = len(event_urls)
        logger.info("Found %d event URLs on listing page", events_found)

        # Step 2: Fetch each detail page
        for detail_url in event_urls:
            try:
                logger.debug("Fetching detail: %s", detail_url)
                detail_resp = session.get(detail_url, timeout=15)
                detail_resp.raise_for_status()
            except requests.RequestException as exc:
                logger.warning("Failed to fetch %s: %s", detail_url, exc)
                events_skipped += 1
                continue

            extracted = _extract_box_event_data(detail_resp.text, detail_url)
            if not extracted or not extracted["title"]:
                logger.warning("Could not extract data from %s", detail_url)
                events_skipped += 1
                continue

            # Build JSON-safe raw_data
            raw_data = {
                k: (v.isoformat() if isinstance(v, datetime) else v)
                for k, v in extracted.items()
            }

            ie, created = ImportedEvent.objects.update_or_create(
                source=source,
                external_id=extracted["external_id"],
                defaults={
                    "scrape_run": run,
                    "raw_data": raw_data,
                    "title": extracted["title"],
                    "description": extracted["description"],
                    "start_datetime": extracted["start_datetime"],
                    "end_datetime": extracted["end_datetime"],
                    "source_url": extracted["source_url"],
                    "image_url": extracted["image_url"],
                    "venue_name": extracted["venue_name"],
                    "venue_address": "Tavistock Place, Plymouth",
                    "venue_postcode": "PL4 8AX",
                    "categories_raw": extracted["categories_raw"],
                    "tags_raw": [],
                },
            )

            if created:
                events_created += 1
                ie.matched_organisation = match_organisation(
                    extracted["venue_name"] or "The Box Plymouth"
                )
                ie.matched_location = match_location(
                    extracted["venue_name"] or "The Box",
                    "PL4 8AX",
                    ie.matched_organisation,
                )
                ie.matched_event = match_existing_event(extracted["external_id"], source.pk)
                if ie.matched_event or ie.matched_organisation:
                    ie.status = "auto_matched"
                ie.save()
            else:
                events_updated += 1
                if ie.status == "pending":
                    ie.matched_organisation = match_organisation(
                        extracted["venue_name"] or "The Box Plymouth"
                    )
                    if ie.matched_organisation:
                        ie.status = "auto_matched"
                        ie.save()

            # Be polite
            time.sleep(0.5)

        run.status = "success"
        run.events_found = events_found
        run.events_created = events_created
        run.events_updated = events_updated
        run.events_skipped = events_skipped
        run.finished_at = timezone.now()
        run.save()

        source.last_scraped_at = timezone.now()
        source.save(update_fields=["last_scraped_at"])

        logger.info(
            "The Box Plymouth scrape complete: %d found, %d new, %d updated, %d skipped",
            events_found,
            events_created,
            events_updated,
            events_skipped,
        )

    except requests.RequestException as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("The Box Plymouth scrape failed: %s", exc)
        raise self.retry(exc=exc)

    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.events_found = events_found
        run.save()
        logger.exception("The Box Plymouth scrape error: %s", exc)
        raise


@shared_task
def scrape_all_sources():
    """
    Dispatch scraping tasks for all enabled ScrapeSource records.
    Intended to be called on a Celery Beat schedule.
    """
    from celery import current_app

    sources = ScrapeSource.objects.filter(enabled=True)
    dispatched = 0

    for source in sources:
        try:
            task = current_app.tasks.get(source.scraper_task_name)
            if task:
                task.delay(source.pk)
                dispatched += 1
                logger.info("Dispatched scrape for '%s'", source.name)
            else:
                logger.warning("Task '%s' not found for source '%s'", source.scraper_task_name, source.name)
        except Exception as exc:
            logger.exception("Failed to dispatch scrape for '%s': %s", source.name, exc)

    logger.info("Dispatched %d scrape task(s)", dispatched)
    return dispatched
