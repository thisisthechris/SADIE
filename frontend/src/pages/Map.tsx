import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import Map2D, { type MapPoint } from "../viz/Map2D";
import { downloadCsv } from "../lib/export";
import { TimelineSlider } from "../components/TimelineSlider";

interface VenueRow {
  location_id: number;
  name: string;
  organisation: string;
  organisation_id: number;
  lng: number;
  lat: number;
  event_count: number;
}

interface EventRow {
  id: number;
  title: string;
  lng: number;
  lat: number;
  start: string | null;
  end: string | null;
  url: string;
  organisation: string;
  organisation_id: number;
  location_name: string;
  location_id: number;
}

type Mode = "venues" | "events";

export default function MapPage() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();

  const { pathname } = useLocation();
  const mode: Mode = pathname.endsWith("/events") ? "events" : "venues";

  const [windowDays, setWindowDays] = useState(90);
  const [offsetDays, setOffsetDays] = useState(0);
  const initialisedRef = useRef(false);

  const venues = useQuery({
    queryKey: ["map-venues", q],
    queryFn: () =>
      api<{ results: VenueRow[] }>("/api/analytics/viz/event-points/", {
        query: q,
      }),
    enabled: mode === "venues",
  });

  const events = useQuery({
    queryKey: ["map-events", q],
    queryFn: () =>
      api<{ results: EventRow[]; count: number }>(
        "/api/analytics/viz/event-list/",
        { query: { ...q, limit: "1000" } },
      ),
    enabled: mode === "events",
  });

  const eventTimes = useMemo(() => {
    const rows = events.data?.results ?? [];
    const ts = rows
      .map((r) => (r.start ? new Date(r.start).getTime() : NaN))
      .filter((n) => !Number.isNaN(n));
    if (!ts.length) return null;
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [events.data]);

  // Seek to today when event data first loads
  useEffect(() => {
    if (!eventTimes || initialisedRef.current) return;
    initialisedRef.current = true;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.ceil((eventTimes.max - eventTimes.min) / 86_400_000));
    const todayOffset = Math.floor((todayStart.getTime() - eventTimes.min) / 86_400_000);
    // Centre today in the 90-day window
    const centred = Math.round(todayOffset - 45);
    setOffsetDays(Math.max(0, Math.min(Math.max(0, totalDays - 90), centred)));
    setWindowDays(Math.min(90, totalDays));
  }, [eventTimes]);

  const eventPoints: MapPoint[] = useMemo(() => {
    if (mode !== "events" || !events.data) return [];
    const rows = events.data.results;
    if (!eventTimes) return rows.map(makeEventPoint);
    const startMs = eventTimes.min + offsetDays * 86_400_000;
    const endMs = startMs + windowDays * 86_400_000;
    return rows
      .filter((r) => {
        if (!r.start) return false;
        const t = new Date(r.start).getTime();
        return t >= startMs && t <= endMs;
      })
      .map(makeEventPoint);
  }, [mode, events.data, eventTimes, offsetDays, windowDays]);

  // Venues: scale pin size by event count so busier venues stand out visually.
  const venuePoints: MapPoint[] = useMemo(() => {
    if (mode !== "venues" || !venues.data) return [];
    const rows = venues.data.results;
    const maxCount = Math.max(1, ...rows.map((v) => v.event_count));
    return rows.map((v) => ({
      id: v.location_id,
      lng: v.lng,
      lat: v.lat,
      weight: 1 + (v.event_count / maxCount) * 3,
      color: "#34d399",
      popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
        v.name,
      )}</div><div>${escapeHtml(v.organisation)}</div><div class="mt-1">${
        v.event_count
      } event${v.event_count === 1 ? "" : "s"}</div></div>`,
    }));
  }, [mode, venues.data]);

  const points = mode === "venues" ? venuePoints : eventPoints;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Map</h1>
          <p className="body-lg">
            {mode === "venues"
              ? "Venue locations across Plymouth."
              : "Individual events plotted by location."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            items={
              mode === "venues"
                ? [
                    {
                      label: "CSV venues",
                      disabled: !venues.data?.results.length,
                      onClick: () =>
                        downloadCsv(
                          "map-venues.csv",
                          venues.data?.results ?? [],
                          [
                            { key: "name", label: "Venue" },
                            { key: "organisation", label: "Organisation" },
                            { key: "lat", label: "Lat" },
                            { key: "lng", label: "Lng" },
                            { key: "event_count", label: "Events" },
                          ],
                        ),
                    },
                  ]
                : [
                    {
                      label: "CSV events (visible)",
                      disabled: !eventPoints.length,
                      onClick: () => {
                        const ids = new Set(eventPoints.map((p) => p.id));
                        const rows = (events.data?.results ?? []).filter((r) =>
                          ids.has(r.id),
                        );
                        downloadCsv("map-events.csv", rows, [
                          { key: "title", label: "Event" },
                          { key: "organisation", label: "Organisation" },
                          { key: "location_name", label: "Venue" },
                          { key: "start", label: "Start" },
                          { key: "lat", label: "Lat" },
                          { key: "lng", label: "Lng" },
                          { key: "url", label: "URL" },
                        ]);
                      },
                    },
                  ]
            }
          />
        </div>
      </div>

      {/* ── Events timeline ── */}
      {mode === "events" && eventTimes && (
        <TimelineSlider
          minMs={eventTimes.min}
          maxMs={eventTimes.max}
          offsetDays={offsetDays}
          windowDays={windowDays}
          onOffsetChange={setOffsetDays}
          onWindowChange={setWindowDays}
          countLabel={`${eventPoints.length} of ${events.data?.count ?? 0} events`}
        />
      )}

      {/* ── Map ── */}
      {!key ? (
        <div className="card p-6 text-sm text-muted">
          MapTiler key missing — set{" "}
          <code className="font-mono">MAPTILER_API_KEY</code> and restart the
          web service.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Map2D
            points={points}
            maptilerKey={key}
            defaultColor={mode === "venues" ? "#34d399" : "#60a5fa"}
          />
        </div>
      )}

      <div className="text-xs text-muted">
        {mode === "venues" && venues.isLoading && "Loading venues…"}
        {mode === "events" && events.isLoading && "Loading events…"}
        {mode === "venues" && venues.data && (
          <>{venues.data.results.length} venues for current filters.</>
        )}
        {mode === "events" && events.data && !eventTimes && (
          <>No events in current filter window.</>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeEventPoint(r: EventRow): MapPoint {
  return {
    id: r.id,
    lng: r.lng,
    lat: r.lat,
    weight: 4,
    color: "#60a5fa",
    popupHtml: `<div class="text-xs max-w-[220px]"><a href="/insights/events/${r.id}" class="font-semibold hover:underline">${escapeHtml(
      r.title,
    )}</a><div>${escapeHtml(r.organisation)}${
      r.location_name ? " · " + escapeHtml(r.location_name) : ""
    }</div>${
      r.start
        ? `<div class="mt-1">${fmt(new Date(r.start).getTime())}</div>`
        : ""
    }</div>`,
  };
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

