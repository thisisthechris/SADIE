import React, { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import Map2D, { type MapPoint, type MapPath } from "../viz/Map2D";

// ── Types matching the analytics endpoints ────────────────────────────────

interface FlowNode {
  location_id: number;
  name: string;
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

/** Format a millisecond timestamp as YYYY-MM-DD. */
function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface JourneyFlowsMapProps {
  /** Org filter (org ID) or empty/undefined for city-wide. */
  org?: string | number | null;
  /** Period start (YYYY-MM-DD) — matches the insights headline period. */
  dateFrom?: string;
  /** Period end (YYYY-MM-DD) — matches the insights headline period. */
  dateTo?: string;
  /** MapTiler API key. */
  maptilerKey: string;
  /** Map height. */
  height?: string;
}

/**
 * JourneyFlowsMap: Embeddable common-pathways flow map with the Plymouth
 * Culture brand gradient (blue → pink across time). Unlike the full Journey
 * Map page, this has no timeline, mode toggle, or legend — it simply renders
 * the flows for the supplied org and date range.
 */
export const JourneyFlowsMap: React.FC<JourneyFlowsMapProps> = ({
  org,
  dateFrom,
  dateTo,
  maptilerKey,
  height = "400px",
}) => {
  const baseQuery = useMemo((): Record<string, string> => {
    const q: Record<string, string> = {};
    if (org) q.org = String(org);
    return q;
  }, [org]);

  // Divide the insights period into N slices, each a brand-gradient step.
  const buckets = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    const startMs = new Date(dateFrom).getTime();
    const endMs = new Date(dateTo).getTime();
    if (!(endMs > startMs)) return [];
    const sliceMs = (endMs - startMs) / N_BUCKETS;
    return Array.from({ length: N_BUCKETS }, (_, i) => ({
      dfrom: msToDateStr(Math.round(startMs + i * sliceMs)),
      dto: msToDateStr(Math.round(startMs + (i + 1) * sliceMs)),
      color: lerpColor(BRAND_EARLY, BRAND_LATE, i / (N_BUCKETS - 1)),
    }));
  }, [dateFrom, dateTo]);

  const bucketResults = useQueries({
    queries: buckets.map((b) => ({
      queryKey: ["insights-journeys-flows-bucket", baseQuery, b.dfrom, b.dto],
      queryFn: () =>
        api<JourneysFlows>("/api/analytics/viz/journeys-flows/", {
          query: { ...baseQuery, dfrom: b.dfrom, dto: b.dto },
        }),
      enabled: buckets.length > 0,
      staleTime: 5 * 60_000,
    })),
  });

  // Full-period flows for the venue nodes.
  const flows = useQuery({
    queryKey: ["insights-journeys-flows", baseQuery, dateFrom, dateTo],
    queryFn: () =>
      api<JourneysFlows>("/api/analytics/viz/journeys-flows/", {
        query: {
          ...baseQuery,
          ...(dateFrom ? { dfrom: dateFrom } : {}),
          ...(dateTo ? { dto: dateTo } : {}),
        },
      }),
  });

  const flowPaths: MapPath[] = useMemo(() => {
    if (!buckets.length) return [];

    // Aggregate total count per (from_id, to_id) pair across all time buckets,
    // then keep only the top 5 connections to avoid visual clutter.
    const pairTotals = new Map<string, number>();
    buckets.forEach((_bucket, idx) => {
      const data = bucketResults[idx]?.data;
      if (!data?.flows.length) return;
      for (const r of data.flows) {
        const key = `${r.from_id}-${r.to_id}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + r.count);
      }
    });
    const top5 = new Set(
      [...pairTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key]) => key),
    );

    const paths: MapPath[] = [];
    buckets.forEach((bucket, idx) => {
      const data = bucketResults[idx]?.data;
      if (!data?.flows.length) return;
      const nodeById = new Map(data.nodes.map((n) => [n.location_id, n]));
      const max = Math.max(...data.flows.map((r) => r.count), 1);
      for (const r of data.flows) {
        if (!top5.has(`${r.from_id}-${r.to_id}`)) continue;
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
          }</div></div>`,
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
      color: "#1e3a8a",
      popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
        n.name,
      )}</div><div>${n.visits} visit${n.visits === 1 ? "" : "s"}</div></div>`,
    }));
  }, [flows.data]);

  const loading =
    flows.isLoading || bucketResults.some((r) => r.isLoading);

  if (!maptilerKey) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500 text-sm">Map unavailable — MapTiler key missing.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  return (
    <Map2D
      points={flowNodes}
      paths={flowPaths}
      maptilerKey={maptilerKey}
      height={height}
      showHeatmap={false}
    />
  );
};

export default JourneyFlowsMap;
