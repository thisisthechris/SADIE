import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnLayer } from "@deck.gl/layers";
import type maplibregl from "maplibre-gl";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import Map2D, { type MapPoint } from "../viz/Map2D";
import Deck3DMap from "../viz/Deck3DMap";
import { downloadCanvasPng, downloadCsv } from "../lib/export";

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
  const [dim, setDim] = useState<"2d" | "3d">("2d");
  const mapRef = useRef<maplibregl.Map | null>(null);

  const bars = useQuery({
    queryKey: ["viz-postcode-bars", q],
    queryFn: () =>
      api<BarsResp>("/api/analytics/viz/postcode-bars/", { query: q }),
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

  const points: MapPoint[] = useMemo(() => {
    const max = Math.max(1, ...(bars.data?.results ?? []).map((b) => b.total));
    return (bars.data?.results ?? []).map((b) => ({
      id: `${b.district}-${b.postcode}`,
      lng: b.lng,
      lat: b.lat,
      // Map weight to 0–100 so Map2D's interpolation gives us a wide radius.
      weight: Math.round((b.total / max) * 100),
      color: "#20c997",
      popupHtml: `<div class="text-sm"><div class="font-medium">${escapeHtml(
        b.district || b.area,
      )}</div><div>${b.total.toLocaleString()} interactions</div><div class="text-xs text-muted">Postcode ${escapeHtml(
        b.postcode,
      )}</div></div>`,
    }));
  }, [bars.data]);

  const totalInteractions = useMemo(
    () => (bars.data?.results ?? []).reduce((s, r) => s + r.total, 0),
    [bars.data],
  );

  const columnLayers = useMemo(() => {
    const data = bars.data?.results ?? [];
    const max = Math.max(1, ...data.map((d) => d.total));
    return [
      new ColumnLayer<Bar>({
        id: "postcode-bars",
        data,
        getPosition: (d) => [d.lng, d.lat],
        getElevation: (d) => d.total,
        getFillColor: (d) => {
          const t = d.total / max;
          return [60 + Math.round(195 * t), 80, 200 - Math.round(150 * t), 220];
        },
        elevationScale: 5,
        radius: 600,
        extruded: true,
        pickable: true,
        material: { ambient: 0.5, diffuse: 0.7, shininess: 16 },
      }),
    ];
  }, [bars.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Postcodes</h1>
          <p className="text-sm text-muted">
            Interaction counts aggregated by Plymouth postcode area.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border overflow-hidden text-sm">
          <DimButton current={dim} value="2d" set={setDim}>2D</DimButton>
          <DimButton current={dim} value="3d" set={setDim}>3D</DimButton>
        </div>
      </div>

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
                      if (canvas) downloadCanvasPng(canvas, "postcode-bars.png");
                    },
                  },
                  {
                    label: "CSV data",
                    disabled: !bars.data?.results.length,
                    onClick: () =>
                      downloadCsv(
                        "postcode-bars.csv",
                        bars.data?.results ?? [],
                        [
                          { key: "postcode", label: "Postcode" },
                          { key: "district", label: "District" },
                          { key: "area", label: "Area" },
                          { key: "total", label: "Total" },
                        ],
                      ),
                  },
                ]
              : [
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
                ]
          }
        />
      </div>

      {dim === "3d" && (
        !key ? (
          <div className="card p-6 text-sm text-muted">
            MapTiler key missing — set <code className="font-mono">MAPTILER_API_KEY</code> and restart.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <Deck3DMap
              layers={columnLayers}
              maptilerKey={key}
              pitch={55}
              zoom={10}
              onMapReady={(m) => (mapRef.current = m)}
            />
          </div>
        )
      )}

      {dim === "2d" && <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b text-sm font-medium">
            Postcode area map
          </div>
          {!key ? (
            <div className="p-6 text-sm text-muted">
              MapTiler key missing — set{" "}
              <code className="font-mono">MAPTILER_API_KEY</code> and restart.
            </div>
          ) : (
            <Map2D
              points={points}
              maptilerKey={key}
              height="400px"
              defaultColor="#20c997"
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
      </div>}

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
          : `${districts.length} districts · ${totalInteractions.toLocaleString()} total interactions`}
      </div>
    </div>
  );
}

function DimButton({
  current,
  value,
  set,
  children,
}: {
  current: "2d" | "3d";
  value: "2d" | "3d";
  set: (d: "2d" | "3d") => void;
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
