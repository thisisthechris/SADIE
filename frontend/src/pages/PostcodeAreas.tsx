import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
import { downloadCsv } from "../lib/export";
import Map2D, {
  type MapPoint,
  type MapPath,
  type AreaFeatureCollection,
  type CorridorFeatureCollection,
} from "../viz/Map2D";

// One distinct colour per postcode district (cycles if >10).
const DISTRICT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b",
];

// Colour per public-transport mode (kept in sync with the map legend).
const MODE_COLORS: Record<string, string> = {
  bus: "#0ea5e9",
  rail: "#7c3aed",
  ferry: "#0891b2",
  park_ride: "#f59e0b",
};

const MODE_LABELS: Record<string, string> = {
  bus: "Bus",
  rail: "Rail",
  ferry: "Ferry",
  park_ride: "Park & Ride",
};

function districtColor(districts: District[], code: string): string {
  const idx = districts.findIndex((d) => d.code === code);
  return DISTRICT_COLORS[idx % DISTRICT_COLORS.length] ?? "#6366f1";
}

function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type PageMode = "overview" | "map";

interface District {
  code: string;
  lng: number;
  lat: number;
  total: number;
}

interface OrgRow {
  organisation: string;
  organisation_id: number | null;
  count: number;
}

interface DistrictsResp {
  districts: District[];
  district?: string;
  orgs?: OrgRow[];
}

interface FlowRow {
  from_code: string;
  from_lng: number;
  from_lat: number;
  to_location_id: number;
  to_name: string;
  to_org: string;
  to_lng: number;
  to_lat: number;
  count: number;
}

interface PostcodeNode {
  code: string;
  lng: number;
  lat: number;
  total: number;
}

interface VenueNode {
  location_id: number;
  name: string;
  organisation: string;
  lng: number;
  lat: number;
}

interface FlowsResp {
  postcode_nodes: PostcodeNode[];
  venue_nodes: VenueNode[];
  flows: FlowRow[];
  flow_count: number;
}

export default function PostcodeAreas() {
  const f = useFilters();
  const cfg = useConfig();
  const mapKey = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>("overview");
  const [layers, setLayers] = useState({
    areas: true,
    corridors: false,
    flows: false,
    venues: false,
  });

  // All districts (no district param = summary only)
  const summary = useQuery({
    queryKey: ["postcode-districts", q],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", { query: q }),
    staleTime: 5 * 60_000,
  });

  // Org breakdown for the selected district
  const breakdown = useQuery({
    queryKey: ["postcode-districts", q, selected],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", {
        query: { ...q, district: selected! },
      }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });

  const districts = summary.data?.districts ?? [];
  const orgs = breakdown.data?.orgs ?? [];
  const selectedTotal = selected
    ? districts.find((d) => d.code === selected)?.total ?? 0
    : 0;

  // Postcode nodes for origin circles on the map (no paths needed)
  const postcodeNodesQuery = useQuery({
    queryKey: ["postcode-flows-nodes", q],
    queryFn: () =>
      api<FlowsResp>("/api/analytics/viz/postcode-flows/", { query: q }),
    enabled: pageMode === "map",
    staleTime: 5 * 60_000,
  });

  // Venue-to-venue flows — same source as JourneyMap's Common Pathways
  interface VenueFlowsResp {
    flows: Array<{ from_id: number; from_name: string; to_id: number; to_name: string; count: number }>;
    nodes: Array<{ location_id: number; name: string; lng: number; lat: number; visits: number }>;
  }
  const venueFlowsQuery = useQuery({
    queryKey: ["journeys-flows-postcode", q],
    queryFn: () =>
      api<VenueFlowsResp>("/api/analytics/viz/journeys-flows/", { query: q }),
    enabled: pageMode === "map",
    staleTime: 5 * 60_000,
  });

  // Static GIS layers (served from frontend/public/data). These are assembled
  // as a GIS data project — real PL district boundaries + Plymouth transport
  // corridors — and loaded client-side for now.
  const boundariesQuery = useQuery<AreaFeatureCollection>({
    queryKey: ["geojson", "pl-postcode-districts"],
    queryFn: async () => {
      const res = await fetch("/data/pl-postcode-districts.geojson");
      if (!res.ok) throw new Error("Failed to load postcode boundaries");
      return res.json();
    },
    enabled: pageMode === "map",
    staleTime: Infinity,
  });

  const corridorsQuery = useQuery<CorridorFeatureCollection>({
    queryKey: ["geojson", "plymouth-pt-corridors"],
    queryFn: async () => {
      const res = await fetch("/data/plymouth-pt-corridors.geojson");
      if (!res.ok) throw new Error("Failed to load transport corridors");
      return res.json();
    },
    enabled: pageMode === "map",
    staleTime: Infinity,
  });

  // Merge interaction totals into the boundary polygons: distinct district
  // colour, fill opacity scaled by activity, selection outline + popup.
  const areaPolygons = useMemo<AreaFeatureCollection | undefined>(() => {
    const fc = boundariesQuery.data;
    if (!fc?.features) return undefined;
    const totalByCode = new Map(districts.map((d) => [d.code, d.total]));
    const maxTotal = Math.max(...districts.map((d) => d.total), 1);
    return {
      type: "FeatureCollection",
      features: fc.features.map((ft) => {
        const props = (ft.properties ?? {}) as Record<string, unknown>;
        const code = String(props.district ?? props.code ?? "");
        const name = props.name ? String(props.name) : "";
        const total = totalByCode.get(code) ?? 0;
        return {
          ...ft,
          properties: {
            ...props,
            code,
            total,
            color: districtColor(districts, code),
            selected: selected === code,
            fillOpacity: 0.2 + 0.55 * (total / maxTotal),
            popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(code)}${name ? ` · ${escHtml(name)}` : ""}</div><div>${total.toLocaleString()} interactions</div></div>`,
          },
        };
      }),
    };
  }, [boundariesQuery.data, districts, selected]);

  // Colour corridors by mode + attach hover tooltips.
  const corridors = useMemo<CorridorFeatureCollection | undefined>(() => {
    const fc = corridorsQuery.data;
    if (!fc?.features) return undefined;
    return {
      type: "FeatureCollection",
      features: fc.features.map((ft) => {
        const props = (ft.properties ?? {}) as Record<string, unknown>;
        const mode = String(props.mode ?? "bus");
        const label = MODE_LABELS[mode] ?? mode;
        const name = String(props.name ?? props.ref ?? label);
        const isPoint = ft.geometry?.type === "Point";
        return {
          ...ft,
          properties: {
            ...props,
            color: MODE_COLORS[mode] ?? "#0ea5e9",
            width: mode === "rail" ? 3 : 2.5,
            opacity: 0.85,
            popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(name)}</div><div>${escHtml(label)}${isPoint ? " site" : ""}</div></div>`,
          },
        };
      }),
    };
  }, [corridorsQuery.data]);

  // Build Map2D data: venue→venue paths + postcode origin circles
  const { mapPaths, mapPoints } = useMemo(() => {
    const pcd = postcodeNodesQuery.data;
    const vfd = venueFlowsQuery.data;

    // When a district is selected, restrict venue-to-venue flows to only those
    // connecting venues that the selected district's residents are known to visit.
    // We derive this set from the postcode-flows data already on the client.
    const relevantVenueIds: Set<number> | null = selected && pcd?.flows?.length
      ? new Set(
          pcd.flows
            .filter((f) => f.from_code === selected)
            .map((f) => f.to_location_id),
        )
      : null;

    // Venue→venue flow paths (blue, width/opacity by count)
    const paths: MapPath[] = [];
    if (vfd?.flows.length) {
      const nodeById = new Map(vfd.nodes.map((n) => [n.location_id, n]));
      const flowsToShow = relevantVenueIds
        ? vfd.flows.filter(
            (f) => relevantVenueIds.has(f.from_id) || relevantVenueIds.has(f.to_id),
          )
        : vfd.flows;
      const max = Math.max(...flowsToShow.map((f) => f.count), 1);
      for (const fl of flowsToShow) {
        const a = nodeById.get(fl.from_id);
        const b = nodeById.get(fl.to_id);
        if (!a || !b) continue;
        const frac = fl.count / max;
        paths.push({
          id: `v-${fl.from_id}-${fl.to_id}`,
          coordinates: [[a.lng, a.lat], [b.lng, b.lat]] as [number, number][],
          color: "#2563eb",
          width: 1 + frac * 8,
          opacity: 0.2 + frac * 0.6,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_name)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors</div></div>`,
        });
      }
    }

    // Points: venue pins only. Postcode districts are now drawn as filled
    // polygons (areaPolygons) rather than centroid circles.
    const points: MapPoint[] = (vfd?.nodes ?? []).map((v) => ({
      id: `venue-${v.location_id}`,
      lng: v.lng,
      lat: v.lat,
      weight: 1,
      color: "#1e293b",
      popupHtml: `<div class="text-xs font-semibold">${escHtml(v.name)}</div>`,
    }));

    return { mapPaths: paths, mapPoints: points };
  }, [postcodeNodesQuery.data, venueFlowsQuery.data, selected]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-small">Postcode Areas</h1>
          <p className="text-sm text-muted">
            Explore which cultural venues and organisations attract visitors from
            each postcode district. Select a district to see the breakdown.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          <button
            className={`px-3 py-1.5 text-sm ${pageMode === "overview" ? "bg-accent text-white" : "text-muted hover:bg-border/30"}`}
            onClick={() => setPageMode("overview")}
          >
            Overview
          </button>
          <button
            className={`px-3 py-1.5 text-sm ${pageMode === "map" ? "bg-accent text-white" : "text-muted hover:bg-border/30"}`}
            onClick={() => setPageMode("map")}
          >
            Pathway Map
          </button>
        </div>
      </div>

      {/* ── District chip picker ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="heading-sub">Select a district</h2>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="btn-ghost text-xs text-muted"
            >
              Clear
            </button>
          )}
        </div>

        {summary.isLoading ? (
          <p className="text-sm text-muted">Loading districts…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {districts.map((d) => {
              const active = d.code === selected;
              return (
                <button
                  key={d.code}
                  onClick={() => setSelected(active ? null : d.code)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? "bg-accent text-white border-accent"
                      : "border-border hover:bg-border/30"
                  }`}
                >
                  <span>{d.code}</span>
                  <span
                    className={`text-[10px] ${
                      active ? "text-white/75" : "text-muted"
                    }`}
                  >
                    {d.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Org breakdown (overview only) ── */}
      {pageMode === "overview" && selected && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="heading-sub">
                {selected} — cultural engagement
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {selectedTotal.toLocaleString()} total interactions from this district
              </p>
            </div>
            <ExportMenu
              items={[
                {
                  label: "Download CSV",
                  disabled: !orgs.length,
                  onClick: () =>
                    downloadCsv(
                      `postcode-${selected}.csv`,
                      orgs,
                      [
                        { key: "organisation", label: "Organisation" },
                        { key: "count", label: "Interactions" },
                      ],
                    ),
                },
              ]}
            />
          </div>

          {breakdown.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !orgs.length ? (
            <p className="text-sm text-muted">No data for {selected}.</p>
          ) : (
            <div className="space-y-2">
              {orgs.map((org, i) => {
                const pct = selectedTotal
                  ? Math.round((org.count / selectedTotal) * 100)
                  : 0;
                return (
                  <div key={org.organisation_id ?? i} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">
                        {org.organisation}
                      </span>
                      <span className="tabular-nums text-muted ml-4 shrink-0">
                        {org.count.toLocaleString()}
                        <span className="text-xs ml-1">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── All-districts overview table ── */}
      {pageMode === "overview" && !selected && !summary.isLoading && districts.length > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="heading-sub">All districts</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1.5">District</th>
                <th className="py-1.5 text-right">Interactions</th>
                <th className="py-1.5 w-1/3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {districts.map((d) => {
                const max = districts[0]?.total ?? 1;
                const pct = Math.round((d.total / max) * 100);
                return (
                  <tr
                    key={d.code}
                    className="cursor-pointer hover:bg-border/20 transition-colors"
                    onClick={() => setSelected(d.code)}
                  >
                    <td className="py-2 font-medium">{d.code}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {d.total.toLocaleString()}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* ── Pathway Map ── */}
      {pageMode === "map" && (
        <>
          {!mapKey ? (
            <div className="card p-6 text-sm text-muted">
              MapTiler key missing — set <code className="font-mono">MAPTILER_API_KEY</code>.
            </div>
          ) : (
            <>
              {/* Layer toggles */}
              <div className="card p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">
                  Layers
                </span>
                {([
                  ["areas", "Postcode areas"],
                  ["corridors", "Transport corridors"],
                  ["flows", "Venue pathways"],
                  ["venues", "Venues"],
                ] as const).map(([key, label]) => (
                  <label
                    key={key}
                    className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={layers[key]}
                      onChange={(e) =>
                        setLayers((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
                {/* Transport mode legend */}
                <div className="flex flex-wrap items-center gap-3 ml-auto">
                  {Object.entries(MODE_LABELS).map(([mode, label]) => (
                    <span
                      key={mode}
                      className="inline-flex items-center gap-1.5 text-xs text-muted"
                    >
                      <span
                        className="w-3.5 h-1 rounded-full"
                        style={{ background: MODE_COLORS[mode] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="card overflow-hidden">
                <Map2D
                  points={mapPoints}
                  paths={layers.flows ? mapPaths : []}
                  areaPolygons={areaPolygons}
                  corridors={corridors}
                  maptilerKey={mapKey}
                  showHeatmap={false}
                  showPoints={layers.venues}
                  showAreas={layers.areas}
                  showCorridors={layers.corridors}
                  onAreaClick={(code) =>
                    setSelected((cur) => (cur === code ? null : code))
                  }
                />
              </div>
            </>
          )}

          {/* District colour legend */}
          {postcodeNodesQuery.data && (
            <div className="card p-4 space-y-2">
              <h2 className="heading-sub text-xs">Postcode origins</h2>
              <div className="flex flex-wrap gap-2">
                {postcodeNodesQuery.data.postcode_nodes.map((n) => (
                  <button
                    key={n.code}
                    onClick={() => setSelected(selected === n.code ? null : n.code)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selected === n.code ? "ring-2 ring-offset-1 ring-current" : "opacity-80 hover:opacity-100"
                    }`}
                    style={{
                      background: districtColor(postcodeNodesQuery.data.postcode_nodes, n.code) + "22",
                      borderColor: districtColor(postcodeNodesQuery.data.postcode_nodes, n.code),
                      color: districtColor(postcodeNodesQuery.data.postcode_nodes, n.code),
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: districtColor(postcodeNodesQuery.data.postcode_nodes, n.code) }}
                    />
                    {n.code}
                    <span className="opacity-70">{n.total.toLocaleString()}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted pt-1">
                Shaded areas show visitor origin districts (darker = busier) · Coloured lines show Plymouth public-transport corridors · Blue arrows show common venue-to-venue pathways · Click an area to highlight it
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
