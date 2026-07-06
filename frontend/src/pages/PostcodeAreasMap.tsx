import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig, useMe } from "../lib/auth";
import Map2D, {
  type MapPoint,
  type MapPath,
  type AreaFeatureCollection,
  type CorridorFeatureCollection,
} from "../viz/Map2D";
import {
  districtColor,
  escHtml,
  MODE_COLORS,
  MODE_LABELS,
  type District,
  type DistrictsResp,
  type FlowsResp,
  type VenueFlowsResp,
} from "../lib/postcodeAreas";

export default function PostcodeAreasMap() {
  const f = useFilters();
  const cfg = useConfig();
  const mapKey = cfg.data?.maptiler_api_key ?? "";
  const { data: me } = useMe();
  const myOrgIds = new Set((me?.member_organisations ?? []).map((o) => o.id));
  const q = f.asQuery();

  // Selected district kept in URL so the Overview tab can read it too.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("district");
  const setSelected = (code: string | null) =>
    setSearchParams(code ? { district: code } : {}, { replace: true });

  const [layers, setLayers] = useState({
    areas: true,
    corridors: false,
    flows: false,
    venues: false,
  });

  // District summary — needed to merge totals into polygon colours.
  const summary = useQuery({
    queryKey: ["postcode-districts", q],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", { query: q }),
    staleTime: 5 * 60_000,
  });
  const districts: District[] = summary.data?.districts ?? [];

  // Postcode → venue flows (used to filter venue-to-venue paths when a district is selected).
  const postcodeNodesQuery = useQuery({
    queryKey: ["postcode-flows-nodes", q],
    queryFn: () =>
      api<FlowsResp>("/api/analytics/viz/postcode-flows/", { query: q }),
    staleTime: 5 * 60_000,
  });

  // Venue-to-venue flow paths (Common Pathways style).
  const venueFlowsQuery = useQuery({
    queryKey: ["journeys-flows-postcode", q],
    queryFn: () =>
      api<VenueFlowsResp>("/api/analytics/viz/journeys-flows/", { query: q }),
    staleTime: 5 * 60_000,
  });

  // Real PL district boundaries (static GeoJSON, ODbL licensed).
  const boundariesQuery = useQuery<AreaFeatureCollection>({
    queryKey: ["geojson", "pl-postcode-districts"],
    queryFn: async () => {
      const res = await fetch("/data/pl-postcode-districts.geojson");
      if (!res.ok) throw new Error("Failed to load postcode boundaries");
      return res.json();
    },
    staleTime: Infinity,
  });

  // Plymouth public-transport corridors (static GeoJSON, ODbL/OSM licensed).
  const corridorsQuery = useQuery<CorridorFeatureCollection>({
    queryKey: ["geojson", "plymouth-pt-corridors"],
    queryFn: async () => {
      const res = await fetch("/data/plymouth-pt-corridors.geojson");
      if (!res.ok) throw new Error("Failed to load transport corridors");
      return res.json();
    },
    staleTime: Infinity,
  });

  // Merge interaction totals into boundary polygons: colour + opacity + popup.
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

  // Colour transport corridors by mode + attach hover tooltips.
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

  // Build venue pins + venue-to-venue flow paths.
  const { mapPaths, mapPoints } = useMemo(() => {
    const pcd = postcodeNodesQuery.data;
    const vfd = venueFlowsQuery.data;

    const relevantVenueIds: Set<number> | null =
      selected && pcd?.flows?.length
        ? new Set(
            pcd.flows
              .filter((fl) => fl.from_code === selected)
              .map((fl) => fl.to_location_id),
          )
        : null;

    const paths: MapPath[] = [];
    if (vfd?.flows.length) {
      const nodeById = new Map(vfd.nodes.map((n) => [n.location_id, n]));
      const flowsToShow = relevantVenueIds
        ? vfd.flows.filter(
            (fl) => relevantVenueIds.has(fl.from_id) || relevantVenueIds.has(fl.to_id),
          )
        : vfd.flows;
      const max = Math.max(...flowsToShow.map((fl) => fl.count), 1);
      for (const fl of flowsToShow) {
        const a = nodeById.get(fl.from_id);
        const b = nodeById.get(fl.to_id);
        if (!a || !b) continue;
        const frac = fl.count / max;
        paths.push({
          id: `v-${fl.from_id}-${fl.to_id}`,
          coordinates: [[a.lng, a.lat], [b.lng, b.lat]],
          color: "#2563eb",
          width: 1 + frac * 8,
          opacity: 0.2 + frac * 0.6,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_name)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors</div></div>`,
        });
      }
    }

    const points: MapPoint[] = (vfd?.nodes ?? []).map((v) => ({
      id: `venue-${v.location_id}`,
      lng: v.lng,
      lat: v.lat,
      weight: 1,
      color: v.organisation_id != null && myOrgIds.has(v.organisation_id)
        ? "#ec4899"
        : "#3b82f6",
      popupHtml: `<div class="text-xs font-semibold">${escHtml(v.name)}</div>`,
    }));

    return { mapPaths: paths, mapPoints: points };
  }, [postcodeNodesQuery.data, venueFlowsQuery.data, selected]);

  return (
    <div className="space-y-6">
      {/* Header + tab nav */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-small">Postcode Pathways</h1>
          <p className="text-sm text-muted">
            PL postcode district boundaries coloured by visitor activity, with
            Plymouth public-transport corridors and common venue-to-venue pathways.
          </p>
        </div>
      </div>

      {/* District chip picker */}
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
                  <span className={`text-[10px] ${active ? "text-white/75" : "text-muted"}`}>
                    {d.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      {!mapKey ? (
        <div className="card p-6 text-sm text-muted">
          MapTiler key missing — set <code className="font-mono">MAPTILER_API_KEY</code>.
        </div>
      ) : (
        <>
          {/* Layer toggles + mode legend */}
          <div className="card p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Layers
            </span>
            {(
              [
                ["areas", "Postcode areas"],
                ["corridors", "Transport corridors"],
                ["flows", "Venue pathways"],
                ["venues", "Venues"],
              ] as const
            ).map(([key, label]) => (
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
                setSelected(selected === code ? null : code)
              }
            />
          </div>
        </>
      )}

      {/* District chip legend below the map */}
      {postcodeNodesQuery.data && (
        <div className="card p-4 space-y-2">
          <h2 className="heading-sub text-xs">Postcode origins</h2>
          <div className="flex flex-wrap gap-2">
            {postcodeNodesQuery.data.postcode_nodes.map((n) => (
              <button
                key={n.code}
                onClick={() => setSelected(selected === n.code ? null : n.code)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selected === n.code
                    ? "ring-2 ring-offset-1 ring-current"
                    : "opacity-80 hover:opacity-100"
                }`}
                style={{
                  background:
                    districtColor(postcodeNodesQuery.data.postcode_nodes, n.code) + "22",
                  borderColor: districtColor(
                    postcodeNodesQuery.data.postcode_nodes,
                    n.code,
                  ),
                  color: districtColor(postcodeNodesQuery.data.postcode_nodes, n.code),
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: districtColor(
                      postcodeNodesQuery.data.postcode_nodes,
                      n.code,
                    ),
                  }}
                />
                {n.code}
                <span className="opacity-70">{n.total.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted pt-1">
            Shaded areas show visitor origin districts (darker = busier) · Coloured
            lines show Plymouth public-transport corridors · Blue arrows show common
            venue-to-venue pathways · Click an area to highlight it
          </p>
        </div>
      )}
    </div>
  );
}
