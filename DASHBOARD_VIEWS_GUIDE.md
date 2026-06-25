# SADIE Dashboard Views — User Guide

## Navigation Structure

The SADIE dashboard is organized into three main sections: **Insights**, **Dashboard**, and **Exploration**. Each section contains related views for analyzing cultural data.

---

## 📊 INSIGHTS SECTION

### OrgInsights (Landing Page)
**Route:** `/` (or `/insights/`)

The main entry point to SADIE. Provides a quick, organization-focused overview of key metrics:

- **Headline Metrics** — Four large stat cards showing:
  - Event count (current month vs previous month with % change)
  - Attendee count (unique visitors with % change)
  - Each card has a colored trend indicator (↑ green for increase, ↓ red for decrease)
  
- **Area Chart** — Visual trend line displaying:
  - Events volume over current and previous month
  - Attendee engagement over the same period
  - Helps identify patterns and seasonal trends

- **Organization Switcher** — Dropdown filter to:
  - View metrics for a specific organization
  - Switch to "View All" for city-wide data
  - All components update automatically when org changes

- **Choropleth Map** — Geographic visualization showing:
  - Plymouth postcode districts colored by interaction intensity
  - Light gray = low activity, dark blue = high activity
  - Click districts to see detailed stats in popups
  - Gives a quick geographic overview of where activity is concentrated

**Best for:** Getting an at-a-glance view of organization performance and geographic distribution

---

### Map View
**Route:** `/map`

Interactive map showing the physical locations of venues and events:

- **Venue Locations** — Green pins marking where partner venues are located
- **Event Counts** — Number badge on each pin shows how many events at that venue
- **Filtering** — Filter by:
  - Organization
  - Date range
  - Event category
  - Search by venue name

- **Map Interaction** — Click pins to:
  - See venue details
  - View recent events at that location
  - Jump to the venue's full profile

**Best for:** Understanding the geographic footprint of venues, finding events at specific locations

---

### Calendar View
**Route:** `/calendar`

Events organized by month with timeline visualization:

- **Monthly Grouping** — All events grouped by month for easy scanning
- **Event Listings** — Shows:
  - Event name and date
  - Host organization
  - Venue location
  - Event category

- **Filters** — Refine by organization, category, date range
- **ICS Feed** — Subscribe button to add events to your calendar app (Google Calendar, Outlook, etc.)

**Best for:** Planning ahead, understanding event volume over time, scheduling

---

### Postcodes View
**Route:** `/postcodes`

Heatmap and detailed breakdown of attendee locations by UK postcode:

- **Heatmap Layer** — Color gradient showing:
  - Density of interactions by geographic area
  - Blue (low activity) → Cyan → Green → Yellow → Red (high activity)
  - Privacy-protected: Combines multiple postcodes into clusters to prevent identifying individuals

- **Points Layer** — Exact geocoded postcode locations with:
  - Green circle markers
  - Size proportional to interaction count
  - Toggle independently from heatmap

- **Data Table** — Top 200 postcode records showing:
  - Postcode/sector
  - Interaction count
  - Percentage of total

- **Area Totals** — Top 20 postcode areas by volume

**Best for:** Understanding where your audience is coming from, identifying geographic catchment areas, targeting outreach

---

## 📈 DASHBOARD SECTION

### Home / Legacy Dashboard
**Route:** `/overview`

The original SADIE dashboard (preserved for backwards compatibility):

- **Organization Stats** — Top-level counts:
  - Total organizations
  - Total venues/locations
  - Total events
  - Total interactions
  - Unique visitors
  - Postcode records

- **Top Organizations** — List of most active partner organizations

- **Category Breakdown** — Chart showing event distribution across categories

- **Event Type Breakdown** — Pie/bar chart showing event type distribution (theatre, music, visual arts, etc.)

- **Recent Events** — Latest events added to the system

**Best for:** System-wide overview (admin view), historical comparison

---

## 🔍 EXPLORATION SECTION

### Organizations View
**Route:** `/organisations`

Browse and compare all partner organizations:

- **Organization Grid/List** — View all organizations with:
  - Organization logo/name
  - Recent activity indicator
  - Quick stats (event count, attendee count)

- **Filtering & Search** — Find organizations by:
  - Name
  - Category (theatre, music, etc.)
  - Activity level

- **Click to Detail** — View individual organization page with:
  - Full profile and description
  - All events
  - Location/contact info
  - Performance metrics

**Best for:** Discovering partners, comparative analysis, contact outreach

---

### Network Visualization
**Route:** `/network`

3D interactive network graph showing relationships:

- **Nodes** — Each node represents:
  - An organization (blue)
  - A venue (green)
  - An event category (red)
  - A user (small orange dots)

- **Connections** — Lines show relationships:
  - Venue → Organization (hosted events)
  - Organization → Category (event types)
  - Organization → Attendee (attendance)

- **Interaction** — Mouse over/click to:
  - Highlight connected nodes
  - See relationship strength (line thickness)
  - Get hover tooltips with names

- **3D Controls** — Rotate, zoom, pan the entire network
  - Use mouse to rotate
  - Scroll to zoom
  - Drag to pan

**Best for:** Understanding ecosystem structure, identifying key connectors, finding clusters and communities

---

### TimeCube Visualization
**Route:** `/timecube`

3D space-time-category visualization showing activity patterns:

- **X Axis (Horizontal)** — Time progression (months)
- **Y Axis (Vertical)** — Event categories
- **Z Axis (Depth)** — Interaction count (height of columns)
- **Color** — Organization or intensity coding

- **Interaction** — Rotate and explore to:
  - See seasonal patterns (peaks and valleys)
  - Identify which categories are most popular
  - Compare time periods side-by-side
  - Click columns for detailed data

**Best for:** Identifying trends over time, seasonal patterns, category popularity by period

---

### Journeys Analytics
**Route:** `/journeys`

Deep dive into user behavior and engagement patterns. The view has two tabs: **Summary** (aggregate stats) and **Journey map** (spatial pathways).

#### Summary tab

- **Monthly Trends** — Line chart showing:
  - Total interactions per month
  - Unique visitors per month
  - Average interactions per visitor

- **Interaction Type Breakdown** — Pie chart showing:
  - What types of interactions users make (click, view, register, etc.)
  - Relative frequency

- **Top Users** — Leaderboard of:
  - Most active visitor hashes (anonymized)
  - Their interaction counts
  - Last seen date

- **Filtering** — By:
  - Organization
  - Date range
  - Event category
  - Interaction type

#### Journey map tab

Plots how visitors move between venues across the city. Two modes:

- **Common pathways** (default) — Aggregated venue→venue flows across all visitors:
  - Each line connects two venues; thicker, more opaque lines = more visitors made that move
  - Venue markers sized by total visits
  - "Top pathways" table ranks the busiest venue-to-venue moves (CSV export available)
  - Best for spotting the routes audiences take through the city

- **Individual visitors** — One coloured path per anonymised visitor:
  - Pick a visitor (or "All") from the selector to trace their ordered stops
  - Numbered markers and a chronological step list show the sequence of venues
  - Order reflects visit sequence, not exact time (interaction dates are day-level)
  - Privacy-safe: only multi-stop visitors with an 8-character hash are shown

**Best for:** Understanding audience engagement, identifying patterns in user behavior, finding power users, and seeing how people travel between partner venues

---

## 🔗 SAVED VIEWS & LINKS

### Saved Views
**Route:** `/views`

Personal and shared filtered dashboards:

- **View List** — All saved views created by you or shared by colleagues
- **Quick Access** — Click to instantly apply complex filters
  - E.g., "Q2 Theatre Events" → filters to category + date range
  - E.g., "North Plymouth" → filters to geographic area

- **Create New** — Save current filters as a reusable view
- **Share** — Make views public for external partners
- **Short Links** — Generate shareable `/v/<slug>/` URLs for reports

**Best for:** Quick access to frequently-viewed data, sharing curated reports with stakeholders

---

### View Resolver (Public Short Links)
**Route:** `/v/<slug>/`

Shareable short URLs that apply saved filters:

- **Auto-apply** — When someone visits, the saved view's filters are applied automatically
- **No login required** — For public views (if shared)
- **Example:** `sadie.org/v/q2-theatre` → automatically shows Q2 theatre events

**Best for:** Sharing reports in emails, presentations, with partners who don't need system access

---

## 🛠️ UTILITY VIEWS

### Imports UI
**Route:** `/imports`

Upload and manage data imports:

- **Upload Form** — Select CSV/JSON file with event data
- **Preview** — Review data before import
- **Mapping** — Map file columns to system fields
- **Import Status** — Progress and error reporting

**Best for:** Data managers, bulk uploading events from external sources

---

### Event Detail
**Route:** `/events/:id`

Full page view of a single event:

- **Event Info** — Full details:
  - Title, description, date/time
  - Venue location
  - Host organization
  - Event category/tags
  - Ticket link or booking info

- **Analytics** — For that event:
  - Total attendees/interactions
  - Geographic distribution of attendees
  - Demographic insights

- **Related Events** — Similar events from same org or category

**Best for:** Event promotion, detailed analysis, share links with external audiences

---

## 🔐 Authentication

### Login
**Route:** `/login`

Secure authentication before accessing any dashboard features:

- **Email/password entry**
- **"Remember me" option**
- **Redirects to last viewed page after login**

**Best for:** First-time access, session reestablishment

---

## 🎯 FILTERING & EXPORT

### Available on Most Views

**Common Filters:**
- **Organization** — Narrow to specific partner(s)
- **Date Range** — Filter by start/end dates
- **Category** — Filter by event type (theatre, music, visual arts, etc.)
- **Search** — Free-text search by name/description

**Export Options:**
- **CSV Export** — Download table data to spreadsheet
- **ICS Export** — Subscribe to calendar feed in Google Calendar or Outlook
- **PDF Report** — Generate printable report with charts

---

## 📱 Mobile Responsive

All views are optimized for:
- **Desktop** — Full-featured with side navigation
- **Tablet** — Collapsible sidebar, stacked components
- **Mobile** — Touch-friendly, vertical layout, simplified charts

---

## 💡 Quick Tips

1. **Start at OrgInsights** — Get the big picture of organization performance
2. **Use Map** — For venue-specific questions
3. **Use Journeys** — To understand audience behavior
4. **Use Network** — To discover relationships between orgs/venues
5. **Save Views** — For frequently-used filter combinations
6. **Share Short Links** — `/v/<slug>/` URLs for partner reports

---

## 🔄 Data Relationships

Understanding how views connect:

```
OrgInsights (headline view)
    ↓
    ├→ Map (venue locations)
    ├→ Calendar (events timeline)
    ├→ Organizations (partner details)
    └→ Postcodes (geographic spread)

Journeys (user behavior)
    ↓
    ├→ Network (entity relationships)
    └→ TimeCube (patterns over time)
```

---

## 🎓 Learning Resources

- Each view has a **help icon** (?) with contextual tips
- **Hover tooltips** explain what each metric means
- **Default filters** show example usage
- **Sample data** is pre-loaded for testing

