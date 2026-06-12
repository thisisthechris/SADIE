import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import type maplibregl from "maplibre-gl";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import Map2D, { type MapPoint } from "../viz/Map2D";
import Deck3DMap from "../viz/Deck3DMap";
import { downloadCanvasPng, downloadCsv } from "../lib/export";

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
type Dim = "2d" | "3d";

export default function MapPage() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();
  const [mode, setMode] = useState<Mode>("venues");
  const [dim, setDim] = useState<Dim>("2d");
  const mapRef = useRef<maplibregl.Map | null>(null);

  const venues = useQuery({
    queryKey: ["map-venues", q],
    queryFn: () =>
      api<{ results: VenueRow[] }>("/api/analytics/viz/event-points/", {
        query: q,
      }),
    enabled: mode === "venues" || dim === "3d",
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

  const [windowDays, setWindowDays] = useState(7);
  const [offsetDays, setOffsetDays] = useState(0);

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

  const venuePoints: MapPoint[] = useMemo(() => {
    if (mode !== "venues" || !venues.data) return [];
    return venues.data.results.map((v) => ({
      id: v.location_id,
      lng: v.lng,
      lat: v.lat,
      weight: v.event_count,
      color: "#34d399",
      popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
        v.name,
      )}</div><div>${escapeHtml(v.organisation)}</div><div class="mt-1">${
        v.event_count
      } event${v.event_count === 1 ? "" : "s"}</div></div>`,
    }));
  }, [mode, venues.data]);

  const points = mode === "venues" ? venuePoints : eventPoints;
  const totalRangeDays = eventTimes
    ? Math.max(1, Math.ceil((eventTimes.max - eventTimes.min) / 86_400_000))
    : 0;

  const hexLayers = useMemo(() => [
    new HexagonLayer<VenueRow>({
      id: "event-hex",
      data: venues.data?.results ?? [],
      getPosition: (d) => [d.lng, d.lat],
      getElevationWeight: (d) => d.event_count,
      elevationAggregation: "SUM",
      radius: 250,
      elevationScale: 30,
      extruded: true,
      coverage: 0.85,
      pickable: true,
      material: { ambient: 0.6, diffuse: 0.6, shininess: 32, specularColor: [60, 64, 70] },
    }),
  ], [venues.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-small">Map</h1>
          <p className="body-lg">
            Geographic exploration of venues and individual events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dim === "2d" && (
            <div className="inline-flex rounded-full border border-border overflow-hidden text-sm">
              <ModeButton current={mode} value="venues" set={setMode}>
                Venues
              </ModeButton>
              <ModeButton current={mode} value="events" set={setMode}>
                Events
              </ModeButton>
            </div>
          )}
          <div className="inline-flex rounded-full border border-border overflow-hidden text-sm">
            <DimButton current={dim} value="2d" set={setDim}>2D</DimButton>
            <DimButton current={dim} value="3d" set={setDim}>3D</DimButton>
          </div>
        </div>
      </div>

      {mode === "events" && eventTimes && (
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <div>
              Showing events from{" "}
              <span className="text-fg font-medium">
                {fmt(eventTimes.min + offsetDays * 86_400_000)}
              </span>{" "}
              to{" "}
              <span className="text-fg font-medium">
                {fmt(
                  eventTimes.min + (offsetDays + windowDays) * 86_400_000,
                )}
              </span>
            </div>
            <div>
              {eventPoints.length} of {events.data?.count ?? 0} events
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Start offset ({offsetDays} day{offsetDays === 1 ? "" : "s"})
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalRangeDays - 1)}
              step={1}
              value={offsetDays}
              onChange={(e) => setOffsetDays(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Window ({windowDays} day{windowDays === 1 ? "" : "s"})
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(1, totalRangeDays)}
              step={1}
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <ExportMenu
          items={
            dim === "3d"
              ? [
                  {
                    label: "PNG snapshot",
                    disabled: !mapRef.current,
                    onClick: () => {
                      const canvas = mapRef.current?.getCanvas();
                      if (canvas) downloadCanvasPng(canvas, "event-density.png");
                    },
                  },
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
              : mode === "venues"
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

      {!key ? (
        <div className="card p-6 text-sm text-muted">
          MapTiler key missing — set{" "}
          <code className="font-mono">MAPTILER_API_KEY</code> and restart the
          web service.
        </div>
      ) : dim === "3d" ? (
        <div className="card overflow-hidden">
          <Deck3DMap
            layers={hexLayers}
            maptilerKey={key}
            onMapReady={(m) => (mapRef.current = m)}
          />
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
        {dim === "3d" && venues.isLoading && "Loading venues…"}
        {dim === "3d" && venues.data && (
          <>{venues.data.results.length} venues for current filters.</>
        )}
        {dim === "2d" && mode === "venues" && venues.isLoading && "Loading venues…"}
        {dim === "2d" && mode === "events" && events.isLoading && "Loading events…"}
        {dim === "2d" && mode === "venues" && venues.data && (
          <>{venues.data.results.length} venues for current filters.</>
        )}
        {dim === "2d" && mode === "events" && events.data && !eventTimes && (
          <>No events in current filter window.</>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  current,
  value,
  set,
  children,
}: {
  current: Mode;
  value: Mode;
  set: (m: Mode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => set(value)}
      className={
        "px-3 py-1.5 " +
        (active
          ? "bg-accent text-white font-medium"
          : "text-muted hover:bg-border/20")
      }
    >
      {children}
    </button>
  );
}

function DimButton({
  current,
  value,
  set,
  children,
}: {
  current: Dim;
  value: Dim;
  set: (d: Dim) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => set(value)}
      className={
        "px-3 py-1.5 " +
        (active
          ? "bg-accent text-white font-medium"
          : "text-muted hover:bg-border/20")
      }
    >
      {children}
    </button>
  );
}

function makeEventPoint(r: EventRow): MapPoint {
  return {
    id: r.id,
    lng: r.lng,
    lat: r.lat,
    weight: 4,
    color: "#60a5fa",
    popupHtml: `<div class="text-xs max-w-[220px]"><a href="/events/${r.id}" class="font-semibold hover:underline">${escapeHtml(
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
