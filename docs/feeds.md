# Event Feeds API

SADIE provides three public feed formats for accessing events: **ICS** (calendar), **JSON**, and **RSS**. All feeds support the same filtering parameters and are publicly accessible without authentication.

## Overview

| Format | Use Case | Endpoint | Content-Type |
|--------|----------|----------|--------------|
| **ICS** | Calendar subscription (Google, Apple, Outlook) | `/calendar.ics` | `text/calendar` |
| **JSON** | Programmatic access (APIs, webhooks) | `/events.json` | `application/json` |
| **RSS** | RSS reader subscription | `/events.rss` | `application/rss+xml` |

---

## Endpoints

### ICS (iCalendar)

Subscribe to events in any calendar application:

- **Global feed**: `/calendar.ics`
- **Organization-specific**: `/calendar/org/<slug>.ics`

**Download in browser**:
```bash
curl https://sadie.example.com/calendar.ics --output events.ics
```

**One-click subscribe** (for calendar apps):
```
webcal://sadie.example.com/calendar.ics
```

**With filters**:
```
/calendar.ics?org=2&date_from=2024-01-01&date_to=2024-12-31
/calendar/org/my-theatre.ics
```

---

### JSON

Get events as a JSON array for programmatic consumption:

- **Global feed**: `/events.json`
- **Organization-specific**: `/api/events/org/<slug>/events.json`

**Fetch in code**:
```javascript
// JavaScript / Node.js
fetch('https://sadie.example.com/events.json')
  .then(r => r.json())
  .then(data => console.log(data.events))
```

```python
# Python
import requests
r = requests.get('https://sadie.example.com/events.json')
events = r.json()['events']
```

```bash
# Bash / curl
curl https://sadie.example.com/events.json | jq '.events'
```

**Response structure**:
```json
{
  "generated_at": "2024-06-12T10:30:00+00:00",
  "count": 42,
  "events": [
    {
      "id": 1,
      "title": "Summer Gala",
      "description": "...",
      "start_datetime": "2024-07-15T19:00:00+00:00",
      "end_datetime": "2024-07-15T23:00:00+00:00",
      "organisation": {
        "id": 2,
        "name": "Royal Opera House",
        "slug": "royal-opera-house"
      },
      "location": {
        "id": 5,
        "name": "Main Hall",
        "address": "100 High St",
        "postcode": "SW1A 1AA"
      },
      "categories": [
        {"id": 1, "name": "Music", "slug": "music"},
        {"id": 2, "name": "Classical", "slug": "classical"}
      ],
      "url": "https://example.com/events/summer-gala",
      "source_url": "https://box-office.example.com/gala2024",
      "image_url": "https://cdn.example.com/gala.jpg",
      "created_at": "2024-06-01T09:00:00+00:00",
      "updated_at": "2024-06-12T10:00:00+00:00"
    }
  ]
}
```

---

### RSS

Subscribe to events in any RSS reader:

- **Global feed**: `/events.rss`
- **Organization-specific**: `/rss/org/<slug>.rss`

**Subscribe in reader**:
```
https://sadie.example.com/events.rss
```

**Fetch raw XML**:
```bash
curl https://sadie.example.com/events.rss
```

**Parse in code**:
```python
# Python with feedparser
import feedparser
feed = feedparser.parse('https://sadie.example.com/events.rss')
for entry in feed.entries:
    print(f"{entry.title} - {entry.published}")
```

---

## Filtering Parameters

All three feed formats support the same query parameters. Use them to filter events:

### Supported Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `org` | integer | Organization ID | `?org=2` |
| `category` | integer | Category ID | `?category=5` |
| `date_from` | date | Start date (YYYY-MM-DD) | `?date_from=2024-01-01` |
| `date_to` | date | End date (YYYY-MM-DD) | `?date_to=2024-12-31` |
| `period` | string | Relative period: `7d`, `30d`, `90d`, `1y` | `?period=30d` |
| `search` | string | Search title/description (JSON/RSS only) | `?search=concert` |
| `start_after` | datetime | Events starting after ISO-8601 datetime | `?start_after=2024-06-12T12:00:00Z` |
| `start_before` | datetime | Events starting before ISO-8601 datetime | `?start_before=2024-06-12T12:00:00Z` |

### Filter Examples

**Events in June 2024**:
```
/events.json?date_from=2024-06-01&date_to=2024-06-30
/calendar.ics?date_from=2024-06-01&date_to=2024-06-30
/events.rss?date_from=2024-06-01&date_to=2024-06-30
```

**Events for specific organization**:
```
/events.json?org=2
/calendar/org/royal-opera-house.ics
/rss/org/royal-opera-house.rss
```

**Music events in the next 30 days**:
```
/events.json?category=5&period=30d
/calendar.ics?category=5&period=30d
/events.rss?category=5&period=30d
```

**Combined filters**:
```
/events.json?org=2&category=1&date_from=2024-06-01&date_to=2024-12-31
```

---

## Caching

All feeds are cached for **600 seconds (10 minutes)**. Cache headers:
```
Cache-Control: public, max-age=600
```

This means:
- Changes may take up to 10 minutes to appear in feeds
- Feeds are CDN-friendly and cacheable
- No authentication required; feeds are globally public

---

## Limits

- **Maximum events per feed**: 2,000 (most recent/earliest ordered)
- **Response timeout**: 30 seconds
- **Feed size**: Typically 50–500 KB depending on event count

---

## Developer Examples

### JavaScript: Fetch and display events

```javascript
async function loadEvents(filter = {}) {
  const params = new URLSearchParams(filter);
  const url = `https://sadie.example.com/events.json?${params}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  data.events.forEach(event => {
    console.log(`${event.title} @ ${event.organisation.name}`);
    console.log(`  ${new Date(event.start_datetime).toLocaleString()}`);
  });
}

// Load events from June 2024
loadEvents({ date_from: '2024-06-01', date_to: '2024-06-30' });
```

### Python: Export events to CSV

```python
import requests
import csv
from datetime import datetime

response = requests.get('https://sadie.example.com/events.json')
events = response.json()['events']

with open('events.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['Title', 'Organisation', 'Start', 'Location', 'Categories'])
    
    for event in events:
        writer.writerow([
            event['title'],
            event['organisation']['name'],
            event['start_datetime'],
            event['location']['name'] if event['location'] else '',
            ', '.join(c['name'] for c in event['categories'])
        ])

print(f"Exported {len(events)} events to events.csv")
```

### Curl: Get upcoming events (next 7 days)

```bash
# Fetch as JSON
curl 'https://sadie.example.com/events.json?period=7d' \
  | jq '.events[] | {title, organisation: .organisation.name, date: .start_datetime}'

# Fetch as ICS
curl 'https://sadie.example.com/calendar.ics?period=7d' > upcoming.ics

# Fetch as RSS
curl 'https://sadie.example.com/events.rss?period=7d'
```

### Ruby: Subscribe to RSS

```ruby
require 'rss'
require 'open-uri'

feed_url = 'https://sadie.example.com/events.rss'
RSS::Parser.parse(open(feed_url)).items.each do |item|
  puts "#{item.title} - #{item.published}"
  puts "  #{item.description}"
end
```

---

## Calendar Integration

### Apple Calendar
1. Open Calendar app
2. File → New Calendar Subscription
3. Paste: `https://sadie.example.com/calendar.ics`

### Google Calendar
1. Open Google Calendar settings
2. Click "Add other calendars" → "+ Add by URL"
3. Paste: `https://sadie.example.com/calendar.ics`

### Microsoft Outlook
1. Open Outlook
2. Home → "Add calendar" → "From internet"
3. Paste: `https://sadie.example.com/calendar.ics`

### Thunderbird
1. Open Calendar
2. Right-click → "New calendar" → "On the network"
3. Type: `https://sadie.example.com/calendar.ics`

---

## RSS Readers

All standard RSS readers work. Popular options:
- **Feedly** (https://feedly.com)
- **NewsBlur** (https://newsblur.com)
- **The Old Reader** (https://theoldreader.com)
- **Inoreader** (https://www.inoreader.com)

Subscribe by entering the feed URL: `https://sadie.example.com/events.rss`

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success; feed content follows |
| `304` | Not modified (cache hit) |
| `404` | Organization not found (org-specific feed) |
| `500` | Server error; try again later |

---

## Troubleshooting

### Feed not updating
- Wait 10 minutes (cache period)
- Check filter parameters are correct
- Verify organization/category IDs exist

### Calendar won't subscribe
- Ensure URL uses `https://` (most apps require HTTPS)
- For webcal:// links, browser must support calendar app protocol
- Try downloading `.ics` file directly and importing

### RSS reader shows old events
- Unsubscribe and re-subscribe
- Clear RSS reader cache
- Check if organization has events in requested date range

### JSON API returns empty
- Verify filters are correct
- Check if events exist for the date range
- Use `?period=90d` for a broader search

---

## Best Practices

1. **Cache feeds locally** if polling frequently (respect 10-minute cache)
2. **Use filters** to reduce response size and improve performance
3. **Handle errors gracefully** (e.g., retry on 5xx, cache locally on failure)
4. **Set appropriate User-Agent** in HTTP requests (helps with debugging)
5. **Test with filters** before deploying to production
6. **Subscribe to organization feeds** when possible (smaller, faster)
7. **Monitor rate limits** (currently only cache-based, no API quota)

---

## API Consistency

- ICS, JSON, and RSS feeds apply **identical filtering logic**
- Same `MAX_EVENTS` limit (2,000)
- Same cache control headers (600s)
- Public + unauthenticated access
- Can mix filters across all formats

---

## Support

For issues or questions about feeds:
1. Check this documentation
2. Test feed URL in browser
3. Verify filters using query parameters
4. Check event data exists in SADIE dashboard

---

*Last updated: June 2024*
