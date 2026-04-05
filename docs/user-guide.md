# SADIE User Guide

## Table of Contents

- [Getting Started](#getting-started)
- [Admin Panel](#admin-panel)
- [Event Scraping](#event-scraping)
- [Reviewing Imported Events](#reviewing-imported-events)
- [Importing Events to the Calendar](#importing-events-to-the-calendar)
- [Managing Organisations & Venues](#managing-organisations--venues)
- [Categories & Tags](#categories--tags)
- [Celery & Scheduled Tasks](#celery--scheduled-tasks)
- [Quick Reference](#quick-reference)

---

## Getting Started

### Running the Application

```bash
docker compose up --build
```

This starts all services (web, database, Redis, Celery worker, Celery Beat scheduler) and automatically runs database migrations and static file collection.

The application is available at **http://localhost:8000**.

### Creating an Admin Account

```bash
docker compose exec web python manage.py createsuperuser
```

---

## Admin Panel

The admin panel is at **http://localhost:8000/herebedragons/**.

Log in with your superuser credentials. From here you can manage:

- **Events** — live events that appear on the calendar and map
- **Organisations** — venues and event organisers
- **Scraping** — imported events, scrape sources, and scrape run logs
- **Categories** — event categories (Music, Theatre, Film, etc.)

---

## Event Scraping

SADIE scrapes events from external sources and stages them for human review before they go live.

### Configured Sources

| Source | Website | Method | Events |
|--------|---------|--------|--------|
| **Plymouth Culture** | plymouthculture.co.uk | Squarespace JSON API | ~390 events from member venues across Plymouth |
| **Theatre Royal Plymouth** | theatreroyal.com | HTML scraping | ~73 events across main stage, The Lyric, and The Drum |
| **The Box Plymouth** | theboxplymouth.com | Embedded JSON extraction | ~31 exhibitions, talks, workshops, and family events |

### How It Works

1. The scraper fetches events from each source website
2. Each event is saved as an **Imported Event** in a staging table
3. The system attempts to **auto-match** events to known organisations and venues using fuzzy name matching
4. A human reviewer approves or rejects events
5. Approved events are **imported** into the live Events table and appear on the calendar

### Running a Scrape Manually

**All sources at once:**
```bash
docker compose exec web python manage.py shell -c "
from scraping.tasks import scrape_all_sources
scrape_all_sources()
"
```

**Individual sources:**
```bash
# Plymouth Culture
docker compose exec web python manage.py shell -c "
from scraping.models import ScrapeSource
from scraping.tasks import scrape_plymouth_culture
source = ScrapeSource.objects.get(name='Plymouth Culture')
scrape_plymouth_culture(source.pk)
"

# Theatre Royal Plymouth
docker compose exec web python manage.py shell -c "
from scraping.models import ScrapeSource
from scraping.tasks import scrape_theatre_royal
source = ScrapeSource.objects.get(name='Theatre Royal Plymouth')
scrape_theatre_royal(source.pk)
"

# The Box Plymouth
docker compose exec web python manage.py shell -c "
from scraping.models import ScrapeSource
from scraping.tasks import scrape_the_box
source = ScrapeSource.objects.get(name='The Box Plymouth')
scrape_the_box(source.pk)
"
```

### Re-running the Scraper

It's safe to run the scraper as many times as you like:

- **Existing events are updated**, not duplicated (matched by unique source + external ID)
- **Review status is preserved** — approved, rejected, or imported events are never overwritten
- Only events still in "Pending" status are re-evaluated for auto-matching

### Automatic Scraping

The scraper runs automatically every day at **2:00 AM** via Celery Beat. This is configured in Django settings and requires the Celery worker and Beat services to be running (they start automatically with `docker compose up`).

---

## Reviewing Imported Events

### Finding Events to Review

1. Go to **Scraping → Imported events** in the admin panel
2. Use the **Status** filter on the right sidebar:
   - **Pending Review** — no venue match found; needs manual review
   - **Auto-Matched** — fuzzy-matched to a known organisation/venue; verify the match is correct

### Event Statuses

| Status | Meaning |
|--------|---------|
| **Pending Review** | Newly scraped, no automatic match found |
| **Auto-Matched** | System found a likely match to a known organisation or venue |
| **Approved** | Reviewer confirmed the event is correct and ready to import |
| **Rejected** | Reviewer decided not to import this event |
| **Imported** | Successfully promoted to the live Events table |

### Reviewing an Individual Event

Click on any imported event to see:

- **Source** — which scraper found it and the raw data from the API
- **Event Details** — title, description, dates, links, images
- **Venue** — venue name, address, postcode, coordinates
- **Tags** — categories and tags from the source
- **Matching** — which organisation, location, and existing event (if any) it was matched to

For auto-matched events, verify the **Matched organisation** and **Matched location** are correct. You can change them using the lookup fields if needed.

### Bulk Approve or Reject

1. Select events using the checkboxes on the list page
2. Choose an action from the dropdown at the top:
   - **Approve selected events** — marks them as ready to import
   - **Reject selected events** — marks them as rejected (they stay in the staging table for audit)
3. Click **Go**

---

## Importing Events to the Calendar

Once events are approved, they need to be **imported** to appear on the calendar.

### Via the Admin Panel

1. Go to **Scraping → Imported events**
2. Filter by **Status = Approved**
3. Select the events you want to import
4. Choose **"Import approved events into main database"** from the action dropdown
5. Click **Go**

The import process will:

- Create or reuse the **Organisation** (from the matched org, or auto-created from the venue name)
- Create or reuse the **Location** (with address, postcode, and coordinates if available)
- Create a new **Event** record (or update an existing one if matched)
- Sync **categories** from the source data
- Mark the imported event status as **Imported**

### Via the Command Line

To bulk-approve and import all auto-matched events:

```bash
docker compose exec web python manage.py shell -c "
from scraping.models import ImportedEvent
from scraping.services import import_approved_event

# Approve all auto-matched events
ImportedEvent.objects.filter(status='auto_matched').update(status='approved')

# Import all approved events
for ie in ImportedEvent.objects.filter(status='approved'):
    import_approved_event(ie)
    print(f'Imported: {ie.title}')
"
```

### After Import

Imported events appear in **Events → Events** in the admin panel and on the dashboard calendar and map views.

---

## Managing Organisations & Venues

### Pre-seeded Venues

The setup command pre-populates known Plymouth venues:

```bash
docker compose exec web python manage.py setup_plymouth_culture
```

This creates organisations and locations for: Theatre Royal Plymouth, The Box, Plymouth Pavilions, Barbican Theatre, Plymouth Arts Cinema, Ocean Studios, Plymouth Music Zone, Devonport Guildhall, and Plymouth City Council.

### Adding New Organisations

If the scraper finds events at a venue that isn't in the system:

1. The imported event will show as **Pending Review** with no matched organisation
2. You can either:
   - **Create the organisation manually** in **Organisations → Organisations**, then edit the imported event to set the match before approving
   - **Just approve and import** — the system will auto-create an organisation from the venue name

### Matching Thresholds

The fuzzy matcher uses an 80% similarity threshold. For example:
- "The Barbican Theatre" matches "Barbican Theatre" at 89% ✓
- "Plymouth Arts Cinema" matches "Plymouth Arts Cinema" at 100% ✓
- A venue with a completely different name won't match and will stay as Pending

---

## Categories & Tags

### Categories

Events can have multiple categories (Music, Theatre, Dance, etc.). These are stored as a many-to-many relationship and can be filtered in the admin and API.

Pre-seeded categories: Music, Theatre, Dance, Visual Arts, Film, Comedy, Family, Workshop, Exhibition, Festival, Literature, Heritage, Outdoor, Community, Drama, Musicals, Opera, Pantomime, General Entertainment, Gig/Concert, Amateur, Displays, Talks and Tours, Super Saturdays.

### Source Tags

Events also retain their **original tags** from the source website in a JSON field. These are preserved for reference but don't affect the category system.

---

## Celery & Scheduled Tasks

### Services

| Service | Purpose |
|---------|---------|
| **celery** | Processes background tasks (scraping, imports) |
| **celery-beat** | Schedules recurring tasks |
| **redis** | Message broker for Celery |

### Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| `scraping.tasks.scrape_all_sources` | Daily at 2:00 AM | Scrapes all enabled sources |

### Checking Task Status

Scrape run logs are available in **Scraping → Scrape runs** in the admin panel, showing:
- Start/finish times
- Status (running/success/failed)
- Event counts (found, created, updated, skipped)
- Error messages (if failed)

---

## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| `docker compose up --build` | Start all services (rebuild if needed) |
| `docker compose exec web python manage.py createsuperuser` | Create admin account |
| `docker compose exec web python manage.py setup_plymouth_culture` | Seed venues and categories |
| `docker compose exec web python manage.py migrate` | Apply database migrations |
| `docker compose exec web python manage.py collectstatic` | Collect static files |

### Key URLs

| URL | Description |
|-----|-------------|
| http://localhost:8000 | Dashboard |
| http://localhost:8000/herebedragons/ | Admin panel |
| http://localhost:8000/api/events/ | Events API |
| http://localhost:8000/api/organisations/ | Organisations API |

### Typical Review Workflow

1. Scraper runs automatically at 2 AM (or run manually)
2. Open admin → **Imported events** → filter by **Auto-Matched**
3. Spot-check matches → **bulk approve** → **bulk import**
4. Filter by **Pending** → manually assign organisations/locations → approve → import
5. Rejected events stay in the staging table for audit
