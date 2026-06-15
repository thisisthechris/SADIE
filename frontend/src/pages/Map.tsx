import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import Map2D, { type MapPoint } from "../viz/Map2D";
import { downloadCsv } from "../lib/export";

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

  // Venues: uniform pins — no size scaling by event count
  const venuePoints: MapPoint[] = useMemo(() => {
    if (mode !== "venues" || !venues.data) return [];
    return venues.data.results.map((v) => ({
      id: v.location_id,
      lng: v.lng,
      lat: v.lat,
      weight: 1,
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
    <div className="space-y-4">
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
        <EventTimeline
          minMs={eventTimes.min}
          maxMs={eventTimes.max}
          offsetDays={offsetDays}
          windowDays={windowDays}
          onOffsetChange={setOffsetDays}
          onWindowChange={setWindowDays}
          totalCount={events.data?.count ?? 0}
          visibleCount={eventPoints.length}
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

// ── EventTimeline ─────────────────────────────────────────────────────────

// Zoom levels ordered from finest to coarsest
const ZOOM_LEVELS = [
  { label: "1W", title: "1 week",   days: 7 },
  { label: "1M", title: "1 month",  days: 30 },
  { label: "3M", title: "3 months", days: 90 },
  // "All" is dynamically totalDays — handled separately
] as const;

function EventTimeline({
  minMs,
  maxMs,
  offsetDays,
  windowDays,
  onOffsetChange,
  onWindowChange,
  totalCount,
  visibleCount,
}: {
  minMs: number;
  maxMs: number;
  offsetDays: number;
  windowDays: number;
  onOffsetChange: (d: number) => void;
  onWindowChange: (d: number) => void;
  totalCount: number;
  visibleCount: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const totalDays = Math.max(1, Math.ceil((maxMs - minMs) / 86_400_000));
  const maxOffset = Math.max(0, totalDays - windowDays);

  // Zoom helpers — keep window centred when zooming
  const zoomTo = (days: number) => {
    const clampedDays = Math.min(days, totalDays);
    const centre = offsetDays + windowDays / 2;
    const next = Math.round(centre - clampedDays / 2);
    onOffsetChange(Math.max(0, Math.min(Math.max(0, totalDays - clampedDays), next)));
    onWindowChange(clampedDays);
  };

  const zoomIn = () => {
    if (windowDays >= totalDays) { zoomTo(90); return; }
    if (windowDays > 30) { zoomTo(30); return; }
    zoomTo(7);
  };
  const zoomOut = () => {
    if (windowDays <= 7) { zoomTo(30); return; }
    if (windowDays <= 30) { zoomTo(90); return; }
    zoomTo(totalDays);
  };
  const isMaxZoom = windowDays <= 7;
  const isMinZoom = windowDays >= totalDays;

  const activeZoomLabel = windowDays >= totalDays ? "All"
    : windowDays <= 7 ? "1W"
    : windowDays <= 30 ? "1M"
    : "3M";

  // Convert a pointer x position within the track to an offset in days
  const xToOffset = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return offsetDays;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // Centre the window on the click position
      const centred = Math.round(frac * totalDays - windowDays / 2);
      return Math.max(0, Math.min(maxOffset, centred));
    },
    [totalDays, windowDays, maxOffset, offsetDays],
  );

  // Track drag state
  const dragStartX = useRef<number | null>(null);
  const dragStartOffset = useRef<number>(0);

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).dataset.handle) {
        // Dragging the handle
        dragStartX.current = e.clientX;
        dragStartOffset.current = offsetDays;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        // Click on track — jump window
        onOffsetChange(xToOffset(e.clientX));
      }
    },
    [offsetDays, onOffsetChange, xToOffset],
  );

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartX.current === null) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaPx = e.clientX - dragStartX.current;
      const deltaDays = Math.round((deltaPx / rect.width) * totalDays);
      const next = Math.max(0, Math.min(maxOffset, dragStartOffset.current + deltaDays));
      onOffsetChange(next);
    },
    [totalDays, maxOffset, onOffsetChange],
  );

  const onTrackPointerUp = useCallback(() => {
    dragStartX.current = null;
  }, []);

  // Build tick marks — weekly when zoomed in (≤30d), monthly otherwise
  const ticks: { label: string; frac: number }[] = useMemo(() => {
    const out: { label: string; frac: number }[] = [];
    if (windowDays <= 30) {
      // Weekly ticks within the visible window + a bit of context
      const visStart = minMs + offsetDays * 86_400_000;
      const visEnd = visStart + windowDays * 86_400_000;
      const cursor = new Date(visStart);
      cursor.setHours(0, 0, 0, 0);
      // Advance to first Monday
      const dayOfWeek = cursor.getDay();
      const daysToMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      cursor.setDate(cursor.getDate() + daysToMon);
      while (cursor.getTime() <= visEnd) {
        const frac = (cursor.getTime() - minMs) / (maxMs - minMs);
        if (frac >= 0 && frac <= 1) {
          out.push({
            label: cursor.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            frac,
          });
        }
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      // Monthly ticks
      const cursor = new Date(minMs);
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + 1);
      while (cursor.getTime() < maxMs) {
        const frac = (cursor.getTime() - minMs) / (maxMs - minMs);
        out.push({
          label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
          frac,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return out;
  }, [minMs, maxMs, windowDays, offsetDays]);

  const windowStartFrac = offsetDays / totalDays;
  const windowWidthFrac = Math.min(1, windowDays / totalDays);
  const startMs = minMs + offsetDays * 86_400_000;
  const endMs = startMs + windowDays * 86_400_000;

  const stepOffset = (delta: number) => {
    onOffsetChange(Math.max(0, Math.min(maxOffset, offsetDays + delta)));
  };

  return (
    <div className="card p-4 space-y-3">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted flex-wrap">
        <div>
          <span className="text-fg font-medium">{fmtShort(startMs)}</span>
          {" → "}
          <span className="text-fg font-medium">{fmtShort(endMs)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{visibleCount} of {totalCount} events</span>
          <span className="text-border">|</span>
          {/* Zoom level indicator */}
          <span className="text-[10px] text-muted">Zoom:</span>
          {(ZOOM_LEVELS as ReadonlyArray<{ label: string; title: string; days: number }>).map((z) => (
            <button
              key={z.label}
              onClick={() => zoomTo(z.days)}
              title={z.title}
              className={
                "px-1.5 py-0.5 rounded text-[10px] border " +
                (activeZoomLabel === z.label
                  ? "bg-accent text-white border-accent"
                  : "border-border hover:bg-border/30")
              }
            >
              {z.label}
            </button>
          ))}
          <button
            onClick={() => { onOffsetChange(0); zoomTo(totalDays); }}
            title="Show all events"
            className={
              "px-1.5 py-0.5 rounded text-[10px] border " +
              (activeZoomLabel === "All"
                ? "bg-accent text-white border-accent"
                : "border-border hover:bg-border/30")
            }
          >
            All
          </button>
          <span className="text-border">|</span>
          {/* Zoom in / out */}
          <button
            onClick={zoomIn}
            disabled={isMaxZoom}
            className="btn-ghost text-xs px-1.5 py-0.5 disabled:opacity-30"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            disabled={isMinZoom}
            className="btn-ghost text-xs px-1.5 py-0.5 disabled:opacity-30"
            title="Zoom out"
          >
            −
          </button>
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative select-none">
        {/* Step buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepOffset(-windowDays)}
            className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
            aria-label="Previous window"
          >
            ←
          </button>

          {/* Track */}
          <div
            ref={trackRef}
            className="relative flex-1 h-8 rounded-lg bg-border/30 cursor-pointer overflow-hidden"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onPointerLeave={onTrackPointerUp}
          >
            {/* Month tick marks */}
            {ticks.map((t) => (
              <div
                key={t.label}
                className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
                style={{ left: `${t.frac * 100}%`, transform: "translateX(-50%)" }}
              >
                <div className="w-px h-2 bg-border/60 mt-1" />
                <span className="text-[9px] text-muted/70 mt-0.5 whitespace-nowrap">{t.label}</span>
              </div>
            ))}

            {/* Window highlight */}
            <div
              data-handle="1"
              className="absolute top-0 h-full bg-accent/25 border-x-2 border-accent cursor-grab active:cursor-grabbing"
              style={{
                left: `${windowStartFrac * 100}%`,
                width: `${Math.max(windowWidthFrac * 100, 1)}%`,
              }}
            >
              {/* Centre grip dots */}
              <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
                <span className="w-0.5 h-3 rounded-full bg-accent/60" />
                <span className="w-0.5 h-3 rounded-full bg-accent/60" />
                <span className="w-0.5 h-3 rounded-full bg-accent/60" />
              </div>
            </div>
          </div>

          <button
            onClick={() => stepOffset(windowDays)}
            className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
            aria-label="Next window"
          >
            →
          </button>
        </div>

        {/* Start / end date labels */}
        <div className="flex justify-between text-[9px] text-muted mt-1 px-8">
          <span>{fmtShort(minMs)}</span>
          <span>{fmtShort(maxMs)}</span>
        </div>
      </div>
    </div>
  );
}

function fmtShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

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
