import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import Map2D, { type MapPoint, type HeatmapPoint } from "../viz/Map2D";
import InfoTooltip from "../components/InfoTooltip";
import { downloadCsv } from "../lib/export";

interface Bar {
  postcode: string;
  district: string;
  area: string;
  lng: number;
  lat: number;
  total: number;
}

interface BarsResp {
  results: Bar[];
}

interface Point {
  postcode: string;
  lng: number;
  lat: number;
  total: number;
}

interface PointsResp {
  count: number;
  results: Point[];
}

interface HeatData {
  lng: number;
  lat: number;
  total: number;
  postcode_count: number;
  postcodes: string[];
}

interface HeatResp {
  count: number;
  clustering: {
    radius_meters: number;
    min_postcodes: number;
    min_interactions: number;
  };
  results: HeatData[];
}

interface Record {
  id: number;
  postcode: string;
  area: string;
  organisation: string;
  organisation_id: number | null;
  interaction_count: number;
  period_start: string | null;
  period_end: string | null;
}

interface RecordsResp {
  count: number;
  limit: number;
  results: Record[];
}

export default function Postcodes() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();
  
  const [showPoints, setShowPoints] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(true);

  const bars = useQuery({
    queryKey: ["viz-postcode-bars", q],
    queryFn: () =>
      api<BarsResp>("/api/analytics/viz/postcode-bars/", { query: q }),
  });

  const points = useQuery({
    queryKey: ["viz-postcode-points", q],
    queryFn: () =>
      api<PointsResp>("/api/analytics/viz/postcode-points/", { query: q }),
  });

  const heatmap = useQuery({
    queryKey: ["viz-postcode-heat", q],
    queryFn: () =>
      api<HeatResp>("/api/analytics/viz/postcode-heat/", { query: q }),
  });

  const records = useQuery({
    queryKey: ["viz-postcode-records", q],
    queryFn: () =>
      api<RecordsResp>("/api/analytics/viz/postcode-records/", {
        query: { ...q, limit: "200" },
      }),
  });

  // Aggregate the district rows for the bar chart + summary table.
  const districts = useMemo(() => {
    const map = new Map<string, { area: string; total: number }>();
    for (const b of bars.data?.results ?? []) {
      const k = b.district || b.area || "Unknown";
      const cur = map.get(k);
      if (cur) cur.total += b.total;
      else map.set(k, { area: k, total: b.total });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [bars.data]);

  const maxDistrictTotal = districts[0]?.total ?? 1;

  const mapPoints: MapPoint[] = useMemo(() => {
    const max = Math.max(1, ...(points.data?.results ?? []).map((p) => p.total));
    return (points.data?.results ?? []).map((p) => ({
      id: p.postcode,
      lng: p.lng,
      lat: p.lat,
      // Map weight to 0–100 so Map2D's interpolation gives us a wide radius.
      weight: Math.round((p.total / max) * 100),
      color: "#20c997",
      popupHtml: `<div class="text-sm"><div class="font-medium">${escapeHtml(
        p.postcode,
      )}</div><div>${p.total.toLocaleString()} interactions</div></div>`,
    }));
  }, [points.data]);

  const heatmapPoints: HeatmapPoint[] = useMemo(() => {
    return (heatmap.data?.results ?? []).map((h) => ({
      lng: h.lng,
      lat: h.lat,
      total: h.total,
      postcode_count: h.postcode_count,
    }));
  }, [heatmap.data]);

  const totalInteractions = useMemo(
    () => (bars.data?.results ?? []).reduce((s, r) => s + r.total, 0),
    [bars.data],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Visitor Locations</h1>
          <div className="flex items-center gap-2">
            <p className="body-lg flex-1">
              See where event visitors are coming from across Plymouth. Pins mark exact postal codes. Bubbles group nearby areas to protect privacy. The heat map shows density.
            </p>
            <InfoTooltip text="privacy_grouping" className="mt-1" />
          </div>
        </div>
        <ExportMenu
          items={[
            {
              label: "CSV districts",
              disabled: !districts.length,
              onClick: () =>
                downloadCsv(
                  "postcode-districts.csv",
                  districts,
                  [
                    { key: "area", label: "District" },
                    { key: "total", label: "Total" },
                  ],
                ),
            },
            {
              label: "CSV records",
              disabled: !records.data?.results.length,
              onClick: () =>
                downloadCsv(
                  "postcode-records.csv",
                  records.data?.results ?? [],
                  [
                    { key: "postcode", label: "Postcode" },
                    { key: "area", label: "Area" },
                    { key: "organisation", label: "Organisation" },
                    { key: "interaction_count", label: "Count" },
                    { key: "period_start", label: "Period start" },
                    { key: "period_end", label: "Period end" },
                  ],
                ),
            },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b text-sm font-medium flex items-center justify-between">
            <span>Postcode map</span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPoints(!showPoints)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showPoints
                    ? "bg-green-500 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                Pins
              </button>
              <button
                onClick={() => setShowClusters(!showClusters)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showClusters
                    ? "bg-sky-500 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                Bubbles
              </button>
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  showHeatmap
                    ? "bg-red-500 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                Heat
              </button>
            </div>
          </div>
          {!key ? (
            <div className="p-6 text-sm text-muted">
              MapTiler key missing — set{" "}
              <code className="font-mono">MAPTILER_API_KEY</code> and restart.
            </div>
          ) : (
            <Map2D
              points={mapPoints}
              heatmapPoints={heatmapPoints}
              maptilerKey={key}
              height="400px"
              defaultColor="#20c997"
              showPoints={showPoints}
              showHeatmap={showHeatmap}
              showClusters={showClusters}
            />
          )}
        </div>

        <div className="card">
          <div className="px-4 py-2 border-b text-sm font-medium">
            Top areas by total interactions
          </div>
          <div className="p-4">
            {districts.length === 0 ? (
              <div className="text-xs text-muted">No data.</div>
            ) : (
              <ul className="space-y-1.5">
                {districts.slice(0, 20).map((d) => {
                  const pct = (d.total / maxDistrictTotal) * 100;
                  return (
                    <li key={d.area}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-mono">{d.area}</span>
                        <span className="tabular-nums text-muted">
                          {d.total.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="px-4 py-2 border-b text-sm font-medium">
            Area summary
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Area</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {districts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-muted py-6">
                      No data yet.
                    </td>
                  </tr>
                ) : (
                  districts.map((d, i) => (
                    <tr key={d.area} className="border-t">
                      <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono">{d.area}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.total.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="px-4 py-2 border-b text-sm font-medium flex items-center justify-between">
            <span>Postcode records</span>
            <span className="text-xs text-muted">
              Top {records.data?.results.length ?? 0} by count
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Postcode</th>
                  <th className="text-left px-3 py-2">Area</th>
                  <th className="text-left px-3 py-2">Organisation</th>
                  <th className="text-right px-3 py-2">Count</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    Period
                  </th>
                </tr>
              </thead>
              <tbody>
                {!records.data?.results.length ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-6">
                      No postcode data yet.
                    </td>
                  </tr>
                ) : (
                  records.data.results.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <code className="font-mono">{r.postcode}</code>
                      </td>
                      <td className="px-3 py-1.5">{r.area || "–"}</td>
                      <td className="px-3 py-1.5">{r.organisation}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.interaction_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted whitespace-nowrap">
                        {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted">
        {bars.isLoading || records.isLoading
          ? "Loading…"
          : `${districts.length} districts · ${totalInteractions.toLocaleString()} total interactions · ${
              heatmap.data?.count ?? 0
            } privacy-grouped clusters`}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
