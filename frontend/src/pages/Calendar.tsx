import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import type { EventSummary, Paginated } from "../lib/types";

/**
 * Lightweight calendar — groups upcoming events by day, with one-click
 * subscribe/download/copy for the filtered ICS feed (served from the legacy
 * /calendar.ics endpoint, which already honours the same filter schema).
 */
export default function CalendarPage() {
  const f = useFilters();
  const q = {
    ...f.asQuery(),
    ordering: "start_datetime",
    page_size: "500",
  };
  const events = useQuery({
    queryKey: ["calendar-events", q],
    queryFn: async () => {
      // Follow DRF pagination so we don't silently truncate at one page.
      const all: EventSummary[] = [];
      let page: Paginated<EventSummary> = await api<Paginated<EventSummary>>(
        "/api/events/",
        { query: q }
      );
      all.push(...page.results);
      while (page.next) {
        // `next` is an absolute URL with the page param baked in.
        const nextUrl = new URL(page.next);
        page = await api<Paginated<EventSummary>>(
          nextUrl.pathname + nextUrl.search
        );
        all.push(...page.results);
      }
      return all;
    },
  });

  const grouped = groupByDay(events.data ?? []);
  const subscribeUrls = buildSubscribeUrls(f.asQuery());
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(subscribeUrls.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="heading-small">Calendar</h1>
          <p className="body-lg">
            Upcoming events grouped by day. Subscribe below to sync this filter
            into your calendar app.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={subscribeUrls.webcal}
            className="btn-ghost text-xs border border-border"
            title="Open in your default calendar app"
          >
            Subscribe (webcal)
          </a>
          <a
            href={subscribeUrls.https}
            download="sadie-events.ics"
            className="btn-ghost text-xs border border-border"
          >
            Download .ics
          </a>
          <a
            href={subscribeUrls.json}
            download="sadie-events.json"
            className="btn-ghost text-xs border border-border"
          >
            Download .json
          </a>
          <a
            href={subscribeUrls.rss}
            className="btn-ghost text-xs border border-border"
            title="Subscribe in your RSS reader"
          >
            RSS Feed
          </a>
          <button
            type="button"
            onClick={onCopy}
            className="btn-ghost text-xs border border-border"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {grouped.map(([day, items]) => (
          <div key={day} className="card overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-border/20 text-sm font-medium">
              {day}
            </div>
            <ul className="divide-y divide-border">
              {items.map((e) => (
                <li key={e.id} className="px-4 py-2 flex items-center gap-3">
                  <span className="text-xs text-muted w-16 tabular-nums">
                    {new Date(e.start_datetime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link
                    to={`/events/${e.id}`}
                    className="flex-1 truncate hover:text-accent"
                  >
                    {e.title}
                  </Link>
                  <span className="text-xs text-muted truncate">
                    {e.organisation_name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {events.data && events.data.length === 0 && (
          <div className="card p-4 text-sm text-muted">No events found.</div>
        )}
      </div>
    </div>
  );
}

function groupByDay(items: EventSummary[]): Array<[string, EventSummary[]]> {
  const map = new Map<string, EventSummary[]>();
  for (const e of items) {
    const key = new Date(e.start_datetime).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

function buildSubscribeUrls(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  const icsPath = qs ? `/calendar.ics?${qs}` : "/calendar.ics";
  const jsonPath = qs ? `/events.json?${qs}` : "/events.json";
  const rssPath = qs ? `/events.rss?${qs}` : "/events.rss";
  
  const https = `${window.location.origin}${icsPath}`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  
  return {
    https,
    webcal,
    json: `${window.location.origin}${jsonPath}`,
    rss: `${window.location.origin}${rssPath}`,
  };
}
