"""
FastMCP server setup for SADIE.

Registers all tools and exposes a resource describing the data model.
"""

import json
from typing import Any

from mcp.server import Server
from mcp.types import (
    Resource,
    TextContent,
    Tool,
)

from . import tools

# Create the MCP server
server = Server("sadie-mcp-server")


# ============================================================================
# TOOLS
# ============================================================================


@server.list_tools()
async def list_tools_impl() -> list[Tool]:
    """List all available tools."""
    return [
        Tool(
            name="search_sadie",
            description="Hybrid full-text + trigram + vector search across events and organisations. "
            "Returns ranked results with scores. Minimum query length: 2 characters.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (e.g., 'Plymouth', 'music events')",
                    },
                    "types": {
                        "type": "string",
                        "description": "Comma-separated: 'event' and/or 'organisation'. Default: 'event,organisation'",
                        "default": "event,organisation",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results (1–50, default 20)",
                        "default": 20,
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="list_events",
            description="List events with optional filtering by organisation, category, date range, search text, or period.",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "integer",
                        "description": "Organisation ID (includes child organisations)",
                    },
                    "category_id": {
                        "type": "integer",
                        "description": "Category ID to filter by",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date: YYYY-MM-DD",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date: YYYY-MM-DD",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search on title/description",
                    },
                    "period": {
                        "type": "string",
                        "description": "Shortcut period: '7d', '30d', '90d', '1y' (overrides date_from if set)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Results per page (1–200, default 50)",
                        "default": 50,
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Pagination offset (default 0)",
                        "default": 0,
                    },
                },
            },
        ),
        Tool(
            name="get_event",
            description="Get full details of a single event including interaction stats.",
            inputSchema={
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "integer",
                        "description": "Event ID",
                    },
                },
                "required": ["event_id"],
            },
        ),
        Tool(
            name="list_organisations",
            description="List organisations with optional search and partner filtering.",
            inputSchema={
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Free-text search on name/description",
                    },
                    "is_partner": {
                        "type": "boolean",
                        "description": "Filter by partner status (true, false, or omit for all)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Results (1–200, default 50)",
                        "default": 50,
                    },
                },
            },
        ),
        Tool(
            name="get_organisation",
            description="Get full organisation details: profile, locations, children, and stats.",
            inputSchema={
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": ["string", "integer"],
                        "description": "Organisation slug (string) or ID (integer)",
                    },
                },
                "required": ["identifier"],
            },
        ),
        Tool(
            name="list_categories",
            description="List all event categories with event counts.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="get_stats_summary",
            description="Top-line dashboard stats: organisation/location/event/interaction counts, unique visitors, postcode count, and upcoming events.",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Organisation ID to filter by",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Category ID to filter by",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date: YYYY-MM-DD",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date: YYYY-MM-DD",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut: '7d', '30d', '90d', '1y'",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type: 'event', 'location'",
                    },
                },
            },
        ),
        Tool(
            name="top_organisations",
            description="Top organisations by filtered event count.",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Filter by organisation",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter by category",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 10)",
                        "default": 10,
                    },
                },
            },
        ),
        Tool(
            name="top_categories",
            description="Top categories by filtered event count.",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Filter by organisation",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter by category",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 12)",
                        "default": 12,
                    },
                },
            },
        ),
        Tool(
            name="interactions_timeseries",
            description="Monthly interaction totals (time series data for charting).",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Filter by organisation",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter by category",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type",
                    },
                },
            },
        ),
        Tool(
            name="interactions_by_type",
            description="Breakdown of interactions by type (event vs. location).",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Filter by organisation",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter by category",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type",
                    },
                },
            },
        ),
        Tool(
            name="postcode_aggregates",
            description="Postcode-area aggregates: total interactions per area and per postcode.",
            inputSchema={
                "type": "object",
                "properties": {
                    "org_id": {
                        "type": "string",
                        "description": "Filter by organisation",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter by category",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date",
                    },
                    "search": {
                        "type": "string",
                        "description": "Free-text search",
                    },
                    "period": {
                        "type": "string",
                        "description": "Period shortcut",
                    },
                    "itype": {
                        "type": "string",
                        "description": "Interaction type",
                    },
                },
            },
        ),
        Tool(
            name="get_event_stats",
            description="Per-event interaction analytics: unique visitors, total interactions, monthly series.",
            inputSchema={
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "integer",
                        "description": "Event ID",
                    },
                },
                "required": ["event_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool_impl(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Dispatch tool calls to the implementation functions."""

    # Map tool name to function with parameter unwrapping
    try:
        if name == "search_sadie":
            result = tools.search_sadie(
                query=arguments.get("query", ""),
                types=arguments.get("types", "event,organisation"),
                limit=arguments.get("limit", 20),
            )
        elif name == "list_events":
            result = tools.list_events(
                org_id=arguments.get("org_id"),
                category_id=arguments.get("category_id"),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                limit=arguments.get("limit", 50),
                offset=arguments.get("offset", 0),
            )
        elif name == "get_event":
            result = tools.get_event(event_id=arguments.get("event_id"))
        elif name == "list_organisations":
            result = tools.list_organisations(
                search=arguments.get("search", ""),
                is_partner=arguments.get("is_partner"),
                limit=arguments.get("limit", 50),
            )
        elif name == "get_organisation":
            result = tools.get_organisation(identifier=arguments.get("identifier"))
        elif name == "list_categories":
            result = tools.list_categories()
        elif name == "get_stats_summary":
            result = tools.get_stats_summary(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
            )
        elif name == "top_organisations":
            result = tools.top_organisations(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
                limit=arguments.get("limit", 10),
            )
        elif name == "top_categories":
            result = tools.top_categories(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
                limit=arguments.get("limit", 12),
            )
        elif name == "interactions_timeseries":
            result = tools.interactions_timeseries(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
            )
        elif name == "interactions_by_type":
            result = tools.interactions_by_type(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
            )
        elif name == "postcode_aggregates":
            result = tools.postcode_aggregates(
                org_id=arguments.get("org_id", ""),
                category_id=arguments.get("category_id", ""),
                date_from=arguments.get("date_from", ""),
                date_to=arguments.get("date_to", ""),
                search=arguments.get("search", ""),
                period=arguments.get("period", ""),
                itype=arguments.get("itype", ""),
            )
        elif name == "get_event_stats":
            result = tools.get_event_stats(event_id=arguments.get("event_id"))
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as e:
        result = {"error": f"Tool execution error: {str(e)}"}

    return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]


# ============================================================================
# RESOURCES
# ============================================================================


@server.list_resources()
async def list_resources_impl() -> list[Resource]:
    """List available resources."""
    return [
        Resource(
            uri="sadie://overview",
            name="SADIE Data Model & Query Schema",
            description="Overview of the SADIE data model and filter parameters for queries.",
            mimeType="text/markdown",
        ),
    ]


@server.read_resource()
async def read_resource_impl(uri: str) -> str:
    """Serve resource content."""
    if uri == "sadie://overview":
        return """# SADIE Data Model & Query Guide

## Overview
SADIE is a Django-based event analytics platform for Plymouth, UK. The backend tracks events, organisations, locations, user interactions (anonymized), and postcode-level data.

## Core Data Models

### Event
- **id**: Unique identifier
- **title**: Event name
- **description**: Details (optional)
- **start_datetime**: Event start time
- **end_datetime**: Event end time (optional)
- **organisation_id**: Foreign key to Organisation
- **location_id**: Foreign key to Location (optional)
- **categories**: Many-to-many with Category
- **url**: External URL (optional)
- **image_url**: Featured image (optional)

### Organisation
- **id**: Unique identifier
- **name**: Organisation name
- **slug**: URL-friendly identifier (unique)
- **description**: Organisation details
- **website**: Website URL
- **is_partner**: Boolean (highlighted organisation)
- **parent_id**: Parent organisation (flat 1-level hierarchy)
- **members**: Many-to-many with User

### Category
- **id**: Unique identifier
- **name**: Category name (e.g., "Music", "Art")
- **slug**: URL-friendly identifier (unique)

### Location
- **id**: Unique identifier
- **organisation_id**: Foreign key to Organisation
- **name**: Venue name
- **address**: Street address
- **postcode**: UK postcode
- **point**: Geographic coordinates (GIS)
- **parent_id**: Sub-venue hierarchy (flat 1-level)

### UserHashInteraction (Anonymized)
- **user_hash**: Anonymized user identifier (SHA256 hash of cookie/session, no PII)
- **interaction_type**: 'event' or 'location'
- **event_id**: Event visited (null if location)
- **location_id**: Location visited (null if event)
- **organisation_id**: Organisation context
- **interaction_date**: Date of interaction

### PostcodeAreaInteraction
- **postcode**: UK postcode (e.g., "PL4 0AB")
- **area**: Postcode district (e.g., "PL4")
- **interaction_count**: Total interactions for period
- **period_start**: Aggregation period start
- **period_end**: Aggregation period end
- **organisation_id**: Organisation context

## Query Filter Parameters

Most analytics tools accept these filters:

- **org**: Organisation ID (includes child organisations)
- **category**: Category ID (single category filter)
- **date_from**: ISO date start (YYYY-MM-DD)
- **date_to**: ISO date end (YYYY-MM-DD)
- **search**: Free-text search on event title/description or organisation name
- **period**: Shortcut period — '7d', '30d', '90d', '1y' (sets date_from if not specified)
- **itype**: Interaction type — 'event' or 'location'

**Examples:**
- Last 30 days: `period='30d'`
- Q4 2024: `date_from='2024-10-01', date_to='2024-12-31'`
- Music events at Plymouth Arts Centre: `category_id=5, org_id=12, search='music'` (if applicable)

## Privacy & Anonymisation

- **user_hash**: Anonymized via SHA256; no personal data stored
- **Postcode aggregation**: Geospatial k-anonymity applied (clustered 300m radius, 2+ postcodes, 5+ interactions min)
- **Analytics tools**: Only return aggregates (counts, sums, unique-user counts), never raw user_hash rows

## Key Insights You Can Answer

- "How many events are coming up in the next month?"
- "What are the top organisations by event count?"
- "Which event categories are trending?"
- "How many unique visitors attended events this month?"
- "What's the geographic spread of interactions by postcode?"
- "Which event had the highest engagement?"

## Tool Categories

1. **Search**: Hybrid FTS + vector search across events and organisations
2. **Browse**: List and detail views for events, organisations, categories
3. **Analytics**: Aggregated stats: summaries, top-N rankings, timeseries, breakdowns, postcodes, per-event stats

---

For detailed tool descriptions, ask the MCP server to list tools.
"""
    else:
        return f"Resource {uri} not found"
