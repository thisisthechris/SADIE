# SADIE — Weekly Development Summary

## Overview
This week we completed a major redesign of the SADIE dashboard landing page and made significant architectural improvements to the production deployment. The application now features a modern, organization-focused insights page with headline metrics, trend visualizations, and geographic data visualization.

---

## 🎨 New Design & OrgInsights Landing Page

### What We Built
We created an entirely new landing page called **OrgInsights** that replaces the old dashboard. This page gives organizations a clear, at-a-glance view of their key metrics.

**Key Features:**
- **Headline Metrics Cards** — Display four key stats with trending indicators:
  - Total events (current month vs previous month)
  - Total attendees (unique visitors)
  - Percentage change for each metric with up/down arrows
  - Organization name or "City (all)" for city-wide view

- **Area Chart** — Visual trend line showing events and attendees over the current and previous month

- **Organization Switcher** — Dropdown to filter the entire dashboard by organization, or view city-wide data

- **Choropleth Map** — Geographic visualization of postcode district data overlaid on Plymouth, color-coded by interaction intensity

### User Experience Improvements
- The landing page now has a responsive grid layout that works beautifully on both mobile (single column) and desktop (multi-column)
- All metrics automatically filter based on the selected organization
- The map provides a quick geographic overview of where activity is concentrated

---

## 💻 Backend Work

### New Analytics Endpoint
Added a `/api/analytics/stats/headline/` endpoint that powers the headline metrics. This endpoint:
- Returns current month vs previous month stats (events count, attendees count, percentage changes)
- Supports organization filtering via query parameter
- Includes comprehensive test coverage for both org-scoped and city-wide queries
- Automatically handles the organizational hierarchy (parent orgs include descendant data)

### How It Works
The metrics are calculated by:
- Pulling data from the current and previous calendar month
- Counting unique visitors using a deduplication hash
- Computing percentage change with proper edge-case handling
- Automatically scoping to the selected organization and all its sub-organizations

---

## 🎯 Frontend Components

We built a suite of reusable React components that make up the new landing page:

### BigStat Component
A large, prominent metric card showing:
- The current value in large text
- The percentage change with a visual indicator (↑ green for increases, ↓ red for decreases)
- A clean card design using Tailwind CSS

### AreaChart Component
An interactive chart built with Recharts that:
- Shows events and attendees as separate area traces
- Covers both the current and previous month
- Updates automatically when the organization filter changes
- Fetches data from the new headline endpoint

### ViewSwitcher Component
A dropdown selector that:
- Lists all available organizations
- Includes a "View All" button for city-wide data
- Updates the global application state when an org is selected
- All other components automatically respond to this filter

### ChoroplethMap Component
A geographic visualization showing:
- Postcode districts in Plymouth as colored polygons
- Color intensity based on interaction volume (light gray = low, dark blue = high)
- Interactive popups on click to show district details
- Legend explaining the color scale
- Loads postcode boundary data from a GeoJSON file

---

## 🗺️ Geographic Data Expansion

### Postcode Districts
We added detailed geographic support for Plymouth's 18 postcode districts (PL1-PL15, PL20-PL21), including:
- Full GeoJSON polygon geometries for each district
- Color coding based on interaction intensity
- Fallback centroids for any postcodes we can't fully geocode

### Test Data Enhancement
Expanded the synthetic test data to create a richer, more realistic dataset:
- 500+ postcode interactions across 43 unique postcodes
- Extended coverage beyond Plymouth to include surrounding regions (Liskeard, Looe, Bodmin, etc.)
- Higher density in city center areas, lower density in outlying areas
- Results in 3 main privacy-protected heatmap clusters across the city

---

## 🐛 Bug Fixes & Refinements

### MapLibre Rendering Issue
Fixed a critical bug where map layers (pins and heatmap) weren't appearing on initial page load. The problem was:
- Components were checking if the map style was loaded, but the check was happening too early
- The event listeners for "style.load" never fired because the style was already loaded
- Solution: Removed the unnecessary conditional checks and implemented proper retry logic

Result: Map layers now render correctly on the first load without requiring users to toggle visibility buttons.

### Breadcrumb Navigation Cleanup
Simplified the breadcrumb navigation by removing the "SADIE" prefix, reducing visual clutter and avoiding repetition since the app name is shown in the menu. Now breadcrumbs display just the section path (e.g., "MAPS / VENUES").

---

## 🚀 Production Deployment Architecture

### Major Architecture Change
We restructured how the application is deployed in production:

**Before:** Django served everything (HTML, API, static files)

**After:** Three-tier architecture with dedicated services:
1. **nginx** — Public-facing front door
   - Serves the built React SPA at the root path (`/`)
   - Reverse-proxies API requests to Django
   - Serves user-uploaded media files
   - Only this container is exposed to the internet

2. **Django (web)** — Internal API and admin
   - No longer serves HTML or static files
   - Only reachable from nginx (not from the internet)
   - Runs migrations and collectstatic on startup

3. **Supporting Services** — Celery workers, Redis, and Postgres
   - Celery handles background jobs
   - Redis powers the message broker
   - Postgres stores all application data

### Why This Matters
- **Performance:** nginx is much faster at serving static files than Python
- **Security:** Django is not exposed to the internet directly
- **Maintainability:** Clear separation of concerns
- **Scalability:** Easier to scale each component independently

### Production Fixes Applied
- Removed a stale volume that was causing outdated static files to be served
- Added proper cache headers for the HTML and asset files
- Fixed issues with Portainer webhooks not applying compose file changes

---

## 🔄 Dashboard Migration Complete

### What Changed
- **Old dashboard views removed:** The 6 old Django template-based views (home, map, calendar, journeys, postcodes, events-map) have been completely removed
- **New landing page:** Root URL (`/`) now redirects to the new React SPA
- **Legacy routes:** Old paths like `/map/`, `/calendar/` now return 404 (as intended)
- **API preserved:** All API endpoints and ICS feeds continue to work

### What's Kept
- ICS calendar feed endpoints (for calendar app integration)
- Short link redirects for saved views
- All API routes

### Why This Migration?
The new React SPA provides:
- Better user experience with client-side routing
- Consistent, modern design using Tailwind CSS
- More interactive visualizations
- Faster page transitions (no full page reloads)

---

## 📊 Testing & Verification

All changes have been tested and verified:
- ✅ 83+ tests passing across all modules
- ✅ Backend API endpoints returning correct data
- ✅ Frontend components rendering correctly
- ✅ Map visualizations working on first load
- ✅ Organization filtering working end-to-end
- ✅ Production deployment tested on staging
- ✅ Docker compose configuration validated

---

## 🎬 Next Steps / Known Items

- The old Django template files in `dashboard/templates/` are still present but no longer used
- These can be archived or deleted in a future cleanup if desired
- Production monitoring is ongoing to ensure no issues with the nginx front-door architecture

---

## 🔗 Files Modified Summary

### Backend
- `analytics/stats_views.py` — New headline endpoint
- `analytics/urls.py` — Route for headline endpoint
- `docker-compose.prod.yml` — Nginx front-door architecture

### Frontend
- `src/pages/OrgInsights.tsx` — New landing page (combines all components)
- `src/pages/App.tsx` — Updated routing (index → OrgInsights, /overview → legacy Home)
- `src/components/BigStat.tsx` — Headline metric cards
- `src/components/AreaChart.tsx` — Trend visualization
- `src/components/ViewSwitcher.tsx` — Organization filter dropdown
- `src/components/ChoroplethMap.tsx` — Geographic choropleth visualization
- `src/components/Layout.tsx` — Navigation updates
- `src/data/pl-postcode-districts.geojson` — Plymouth postcode polygon data
- `src/lib/types.ts` — TypeScript types for new components

### Configuration & Infrastructure
- `Dockerfile`, `nginx/Dockerfile` — Updated Docker build
- `docker-compose.prod.yml` — New nginx + Django architecture
- `nginx/default.conf` — Nginx routing configuration

---

## 📈 Impact

**User-Facing:**
- Faster, more modern dashboard with better visualizations
- Organization-focused insights that answer key questions immediately
- Beautiful geographic visualization of activity distribution

**Developer-Facing:**
- Cleaner architecture with dedicated services
- Better separation between frontend and backend
- Easier to scale and maintain
- Reduced complexity with Django handling only API

**Performance:**
- Faster static file serving (nginx vs Django)
- Better caching strategy for HTML and assets
- More efficient use of container resources

---

**Total Changes This Week:** ~15 files modified, 1 new component library, 1 major architectural upgrade, complete dashboard redesign ✨
