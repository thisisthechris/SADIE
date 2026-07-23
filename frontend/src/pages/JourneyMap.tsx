import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig, useMe } from "../lib/auth";
import Map2D, { type MapPoint, type MapPath } from "../viz/Map2D";
import ExportMenu from "../components/ExportMenu";
import OrgToggle from "../components/OrgToggle";
import InfoTooltip from "../components/InfoTooltip";
import { downloadCsv } from "../lib/export";
import { TimelineSlider, msToDateStr } from "../components/TimelineSlider";

// ── Types matching the analytics endpoints ────────────────────────────────

interface JourneyStep {
  location_id: number;
  name: string;
  organisation: string;
  organisation_id: number | null;
  lng: number;
  lat: number;
  date: string | null;
  type: string;
  event_id: number | null;
  event_title: string;
}

interface VisitorJourney {
  visitor: string;
  step_count: number;
  steps: JourneyStep[];
}

interface JourneysPaths {
  count: number;
  journeys: VisitorJourney[];
}

interface FlowNode {
  location_id: number;
  name: string;
  organisation_id?: number | null;
  lng: number;
  lat: number;
  visits: number;
}

interface Flow {
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  count: number;
}

interface JourneysFlows {
  node_count: number;
  flow_count: number;
  nodes: FlowNode[];
  flows: Flow[];
}

type Mode = "flows" | "visitors";

// Distinct colours for individual visitor paths.
const VISITOR_COLORS = [
  "#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed",
  "#dc2626", "#0891b2", "#ca8a04", "#9333ea", "#16a34a",
];

const N_BUCKETS = 6;

// Plymouth Culture brand gradient endpoints (earliest → latest bucket).
const BRAND_EARLY = "#001FCC"; // primary blue
const BRAND_LATE = "#f73d85"; // pink

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Linear RGB interpolation between two hex colours; t in [0, 1]. */
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function JourneyMap() {
  const f = useFilters();
  const cfg = useConfig();  const { data: me } = useMe();
  const myOrgIds = new Set((me?.member_organisations ?? []).map((o) => o.id));  const key = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();

  const [mode, setMode] = useState<Mode>("flows");
  const [selectedVisitor, setSelectedVisitor] = useState<string | null>(null);

  // ── Timeline state (Common Pathways only) ──
  const [windowDays, setWindowDays] = useState(90);
  const [offsetDays, setOffsetDays] = useState(0);
  const initialisedRef = useRef(false);

  // Always load paths to derive the full date range for the timeline.
  // Flows are re-queried whenever the timeline window changes.
  const paths = useQuery({
    queryKey: ["journeys-paths", q],
    queryFn: () =>
      api<JourneysPaths>("/api/analytics/viz/journeys-paths/", {
        query: { ...q, limit: "100" },
      }),
  });

  // Derive date range from all loaded step dates.
  const stepTimestamps = useMemo(() => {
    const ts: number[] = [];
    for (const j of paths.data?.journeys ?? []) {
      for (const s of j.steps) {
        if (s.date) ts.push(new Date(s.date).getTime());
      }
    }
    return ts;
  }, [paths.data]);

  const dateTimes = useMemo(() => {
    if (!stepTimestamps.length) return null;
    return { min: Math.min(...stepTimestamps), max: Math.max(...stepTimestamps) };
  }, [stepTimestamps]);

  // Initialise timeline centred on the most recent data when first loaded.
  useEffect(() => {
    if (!dateTimes || initialisedRef.current) return;
    initialisedRef.current = true;
    const totalDays = Math.max(1, Math.ceil((dateTimes.max - dateTimes.min) / 86_400_000));
    setWindowDays(Math.min(90, totalDays));
    const end = Math.max(0, totalDays - Math.min(90, totalDays));
    setOffsetDays(end);
  }, [dateTimes]);

  // Build dfrom/dto query params from the timeline window.
  // Debounced so rapid slider drags don't fire a burst of API calls.
  const [debouncedTimeQuery, setDebouncedTimeQuery] = useState<Record<string, string>>({});

  const timeQuery = useMemo((): Record<string, string> => {
    if (!dateTimes) return {};
    const startMs = dateTimes.min + offsetDays * 86_400_000;
    const endMs = startMs + windowDays * 86_400_000;
    return { dfrom: msToDateStr(startMs), dto: msToDateStr(endMs) };
  }, [dateTimes, offsetDays, windowDays]);

  // Debounce: only commit the query after the user pauses for 300ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTimeQuery(timeQuery), 300);
    return () => clearTimeout(t);
  }, [timeQuery]);

  const flows = useQuery({
    queryKey: ["journeys-flows", q, debouncedTimeQuery],
    queryFn: () =>
      api<JourneysFlows>("/api/analytics/viz/journeys-flows/", {
        query: { ...q, ...debouncedTimeQuery },
      }),
    enabled: mode === "flows",
  });

  // ── Brand buckets: divide the window into N slices, each a brand-gradient step ──
  // Colour ramps blue→pink as time moves from start to end.

  const buckets = useMemo(() => {
    if (!dateTimes) return [];
    const startMs = dateTimes.min + offsetDays * 86_400_000;
    const endMs = startMs + windowDays * 86_400_000;
    const sliceMs = (endMs - startMs) / N_BUCKETS;
    return Array.from({ length: N_BUCKETS }, (_, i) => ({
      dfrom: msToDateStr(Math.round(startMs + i * sliceMs)),
      dto: msToDateStr(Math.round(startMs + (i + 1) * sliceMs)),
      color: lerpColor(BRAND_EARLY, BRAND_LATE, i / (N_BUCKETS - 1)),
    }));
  }, [dateTimes, offsetDays, windowDays]);

  const bucketResults = useQueries({
    queries: buckets.map((b) => ({
      queryKey: ["journeys-flows-bucket", q, b.dfrom, b.dto],
      queryFn: () =>
        api<JourneysFlows>("/api/analytics/viz/journeys-flows/", {
          query: { ...q, dfrom: b.dfrom, dto: b.dto },
        }),
      enabled: mode === "flows" && buckets.length > 0,
      staleTime: 5 * 60_000,
    })),
  });


  // ── Common pathways (flows) → rainbow map paths + venue nodes ──
  const flowPaths: MapPath[] = useMemo(() => {
    if (!buckets.length) return [];
    const paths: MapPath[] = [];
    buckets.forEach((bucket, idx) => {
      const data = bucketResults[idx]?.data;
      if (!data?.flows.length) return;
      const nodeById = new Map(data.nodes.map((n) => [n.location_id, n]));
      const max = Math.max(...data.flows.map((r) => r.count), 1);
      for (const r of data.flows) {
        if (r.count <= 3) continue;
        const a = nodeById.get(r.from_id);
        const b = nodeById.get(r.to_id);
        if (!a || !b) continue;
        const frac = r.count / max;
        paths.push({
          id: `b${idx}-${r.from_id}-${r.to_id}`,
          coordinates: [[a.lng, a.lat], [b.lng, b.lat]] as [number, number][],
          color: bucket.color,
          width: 1 + frac * 7,
          opacity: 0.2 + frac * 0.5,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
            r.from_name,
          )} → ${escapeHtml(r.to_name)}</div><div>${r.count} visitor${
            r.count === 1 ? "" : "s"
          } · ${bucket.dfrom} to ${bucket.dto}</div></div>`,
        } as MapPath);
      }
    });
    return paths;
  }, [buckets, bucketResults]);

  const flowNodes: MapPoint[] = useMemo(() => {
    const nodes = flows.data?.nodes ?? [];
    if (!nodes.length) return [];
    const max = Math.max(...nodes.map((n) => n.visits), 1);
    return nodes.map((n) => ({
      id: n.location_id,
      lng: n.lng,
      lat: n.lat,
      weight: 1 + (n.visits / max) * 2,
      color: n.organisation_id != null && myOrgIds.has(n.organisation_id)
        ? "#ec4899"
        : "#3b82f6",
      popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
        n.name,
      )}</div><div>${n.visits} visit${n.visits === 1 ? "" : "s"}</div></div>`,
    }));
  }, [flows.data, myOrgIds]);

  // ── Individual visitors → coloured paths + step markers ──
  const journeys = paths.data?.journeys ?? [];
  const activeVisitor = selectedVisitor
    ? journeys.find((j) => j.visitor === selectedVisitor) ?? null
    : null;

  const visitorPaths: MapPath[] = useMemo(() => {
    if (!journeys.length) return [];
    if (activeVisitor) {
      return [
        {
          id: activeVisitor.visitor,
          coordinates: activeVisitor.steps.map(
            (s) => [s.lng, s.lat] as [number, number],
          ),
          color: VISITOR_COLORS[0],
          width: 4,
          opacity: 0.9,
          popupHtml: `<div class="text-xs">Visitor ${escapeHtml(
            activeVisitor.visitor,
          )} · ${activeVisitor.step_count} stops</div>`,
        },
      ];
    }
    // "All" — faint overlay of every visitor path.
    return journeys.map((j, i) => ({
      id: j.visitor,
      coordinates: j.steps.map((s) => [s.lng, s.lat] as [number, number]),
      color: VISITOR_COLORS[i % VISITOR_COLORS.length],
      width: 2,
      opacity: 0.35,
      popupHtml: `<div class="text-xs">Visitor ${escapeHtml(
        j.visitor,
      )} · ${j.step_count} stops</div>`,
    }));
  }, [journeys, activeVisitor]);

  const visitorPoints: MapPoint[] = useMemo(() => {
    if (!activeVisitor) return [];
    return activeVisitor.steps.map((s, i) => ({
      id: `${activeVisitor.visitor}-${i}`,
      lng: s.lng,
      lat: s.lat,
      weight: 1.4,
      color: s.organisation_id != null && myOrgIds.has(s.organisation_id)
        ? "#ec4899"
        : VISITOR_COLORS[0],
      popupHtml: `<div class="text-xs"><div class="font-semibold">${
        i + 1
      }. ${escapeHtml(s.name)}</div>${
        s.event_title
          ? `<div class="text-muted">${escapeHtml(s.event_title)}</div>`
          : ""
      }</div>`,
    }));
  }, [activeVisitor]);

  const mapPaths = mode === "flows" ? flowPaths : visitorPaths;
  const mapPoints = mode === "flows" ? flowNodes : visitorPoints;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Journey Map</h1>
          <p className="body-lg">
            Individual visitor routes and the common pathways visitors take between venues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OrgToggle />
          {mode === "flows" && (
            <ExportMenu
              items={[
                {
                  label: "CSV flows",
                  disabled: !flows.data?.flows.length,
                  onClick: () =>
                    downloadCsv("journey-flows.csv", flows.data?.flows ?? [], [
                      { key: "from_name", label: "From" },
                      { key: "to_name", label: "To" },
                      { key: "count", label: "Visitors" },
                    ]),
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* ── Mode toggle ── */}
      <div className="inline-flex rounded-lg border border-border overflow-hidden">
        <button
          className={`px-3 py-1.5 text-sm ${
            mode === "flows"
              ? "bg-accent text-white"
              : "bg-card text-muted hover:bg-border/30"
          }`}
          onClick={() => setMode("flows")}
        >
          Common pathways
        </button>
        <button
          className={`px-3 py-1.5 text-sm ${
            mode === "visitors"
              ? "bg-accent text-white"
              : "bg-card text-muted hover:bg-border/30"
          }`}
          onClick={() => setMode("visitors")}
        >
          Individual visitors
        </button>
      </div>

      {mode === "visitors" && (
        <VisitorPicker
          journeys={journeys}
          selected={selectedVisitor}
          onSelect={setSelectedVisitor}
        />
      )}

      {/* ── Timeline (Common Pathways only) ── */}
      {mode === "flows" && dateTimes && (
        <TimelineSlider
          minMs={dateTimes.min}
          maxMs={dateTimes.max}
          offsetDays={offsetDays}
          windowDays={windowDays}
          onOffsetChange={setOffsetDays}
          onWindowChange={setWindowDays}
          countLabel={`${flows.data?.flow_count ?? 0} flows · ${flows.data?.node_count ?? 0} venues`}
          gradientColors={buckets.map((b) => b.color)}
          dataTimestamps={stepTimestamps}
        />
      )}

      {/* ── Map + Top Pathways side-by-side (flows), full-width (visitors) ── */}
      {mode === "flows" ? (
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            {!key ? (
              <div className="card p-6 text-sm text-muted">
                MapTiler key missing — set{" "}
                <code className="font-mono">MAPTILER_API_KEY</code> and restart the
                web service.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <Map2D
                  points={mapPoints}
                  paths={mapPaths}
                  maptilerKey={key}
                  showHeatmap={false}
                />
              </div>
            )}
          </div>
          <div className="w-80 shrink-0 max-h-[70vh] overflow-y-auto">
            <FlowsTable flows={flows.data?.flows ?? []} loading={flows.isLoading} />
          </div>
        </div>
      ) : (
        <>
          {!key ? (
            <div className="card p-6 text-sm text-muted">
              MapTiler key missing — set{" "}
              <code className="font-mono">MAPTILER_API_KEY</code> and restart the
              web service.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <Map2D
                points={mapPoints}
                paths={mapPaths}
                maptilerKey={key}
                showHeatmap={false}
              />
            </div>
          )}
          {activeVisitor ? (
            <VisitorSteps journey={activeVisitor} />
          ) : (
            <div className="text-xs text-muted">
              {paths.isLoading
                ? "Loading visitor journeys…"
                : journeys.length
                  ? `Showing ${journeys.length} visitor journeys. Select one above to see its stops.`
                  : "No multi-stop visitor journeys for the current filters."}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Visitor picker ─────────────────────────────────────────────────────────

function VisitorPicker({
  journeys,
  selected,
  onSelect,
}: {
  journeys: VisitorJourney[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  if (!journeys.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        className={`px-2.5 py-1 rounded-md text-xs border ${
          selected === null
            ? "bg-accent text-white border-accent"
            : "bg-white text-muted border-border hover:bg-border/30"
        }`}
        onClick={() => onSelect(null)}
      >
        All ({journeys.length})
      </button>
      {journeys.slice(0, 30).map((j) => (
        <button
          key={j.visitor}
          className={`px-2.5 py-1 rounded-md text-xs border font-mono ${
            selected === j.visitor
              ? "bg-accent text-white border-accent"
              : "bg-white text-muted border-border hover:bg-border/30"
          }`}
          onClick={() => onSelect(j.visitor)}
          title={`${j.step_count} stops`}
        >
          {j.visitor} · {j.step_count}
        </button>
      ))}
    </div>
  );
}

// ── Visitor step list (TapIn-style chronological journey) ──────────────────

function VisitorSteps({ journey }: { journey: VisitorJourney }) {
  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="heading-sub">
          Journey for visitor{" "}
          <span className="font-mono text-accent">{journey.visitor}</span>
        </h2>
        <InfoTooltip text="Anonymised identifier — no personal information is shown. Order reflects visit sequence, not exact time." />
      </div>
      <ol className="space-y-3">
        {journey.steps.map((s, i) => (
          <li key={`${s.location_id}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-semibold">
                {i + 1}
              </span>
              {i < journey.steps.length - 1 && (
                <span className="w-px flex-1 bg-border my-1" />
              )}
            </div>
            <div className="pb-1">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted">
                {s.organisation}
              </div>
              {s.event_title && (
                <div className="text-xs text-muted">{s.event_title}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Common pathways table ──────────────────────────────────────────────────

function FlowsTable({ flows, loading }: { flows: Flow[]; loading: boolean }) {
  if (loading) return <div className="text-xs text-muted">Loading flows…</div>;
  if (!flows.length)
    return (
      <div className="text-xs text-muted">
        No venue-to-venue movements for the current filters.
      </div>
    );
  const max = Math.max(...flows.map((r) => r.count), 1);
  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="heading-sub">Top pathways</h2>
        <InfoTooltip text="How many visitors moved directly from one venue to the next, in visit order." />
      </div>
      <ol className="space-y-1.5">
        {flows.slice(0, 25).map((r) => (
          <li key={`${r.from_id}-${r.to_id}`} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="truncate">
                {r.from_name} <span className="text-muted">→</span>{" "}
                {r.to_name}
              </span>
              <span className="text-muted tabular-nums shrink-0">
                {r.count}
              </span>
            </div>
            <div className="h-1 bg-border/50 rounded mt-1">
              <div
                className="h-1 bg-accent rounded"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
