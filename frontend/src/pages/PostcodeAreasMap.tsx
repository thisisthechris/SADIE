import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Map as MapIcon, Route, ArrowLeftRight, MapPin, type LucideIcon } from "lucide-react";
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

// Core Plymouth postcode districts — coloured with districtColor; all others shown as gray.
const CORE_PLYMOUTH = new Set(["PL1", "PL2", "PL3", "PL4", "PL5", "PL6", "PL7", "PL8", "PL9"]);

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
            color: CORE_PLYMOUTH.has(code) ? districtColor(districts, code) : "#94a3b8",
            selected: selected === code,
            fillOpacity: selected
              ? selected === code
                ? Math.min(0.85, 0.4 + 0.45 * (total / maxTotal))        // selected: 0.40–0.85
                : total > 0 ? 0.04 + 0.08 * (total / maxTotal) : 0.06   // others: nearly invisible
              : total > 0 ? 0.15 + 0.6 * (total / maxTotal) : 0.10,     // none selected: normal
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

    const paths: MapPath[] = [];

    if (selected && pcd?.flows?.length) {
      // Postcode selected: draw spokes from that postcode centroid to every
      // venue its visitors attended.  Opacity encodes connection strength.
      const selectedFlows = pcd.flows.filter((fl) => fl.from_code === selected);
      const max = Math.max(...selectedFlows.map((fl) => fl.count), 1);
      for (const fl of selectedFlows) {
        const frac = fl.count / max;
        paths.push({
          id: `pc-${fl.from_code}-${fl.to_location_id}`,
          coordinates: [[fl.from_lng, fl.from_lat], [fl.to_lng, fl.to_lat]],
          color: "#2563eb",
          width: 1.5,
          opacity: 0.1 + frac * 0.8,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_code)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors</div></div>`,
        });
      }
    } else if (vfd?.flows.length) {
      // No postcode selected: show venue-to-venue flows.
      const nodeById = new Map(vfd.nodes.map((n) => [n.location_id, n]));
      const max = Math.max(...vfd.flows.map((fl) => fl.count), 1);
      for (const fl of vfd.flows) {
        const a = nodeById.get(fl.from_id);
        const b = nodeById.get(fl.to_id);
        if (!a || !b) continue;
        const frac = fl.count / max;
        paths.push({
          id: `v-${fl.from_id}-${fl.to_id}`,
          coordinates: [[a.lng, a.lat], [b.lng, b.lat]],
          color: "#2563eb",
          width: 1.5,
          opacity: 0.1 + frac * 0.8,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_name)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors</div></div>`,
        });
      }
    }

    const points: MapPoint[] = (vfd?.nodes ?? []).map((v) => ({
      id: `venue-${v.location_id}`,
      lng: v.lng,
      lat: v.lat,
      weight: 1,
      color: (f.org || (v.organisation_id != null && myOrgIds.has(v.organisation_id)))
        ? "#3b82f6"   // blue — current org's venues
        : "#94a3b8",  // gray — other venues
      popupHtml: `<div class="text-xs font-semibold">${escHtml(v.name)}</div>`,
    }));

    return { mapPaths: paths, mapPoints: points };
  }, [postcodeNodesQuery.data, venueFlowsQuery.data, selected, f.org, myOrgIds]);

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
                ["areas",     "Postcode areas",      MapIcon       ],
                ["corridors", "Transport corridors", Route         ],
                ["flows",     "Venue pathways",       ArrowLeftRight],
                ["venues",    "Venues",               MapPin        ],
              ] as [keyof typeof layers, string, LucideIcon][]
            ).map(([key, label, Icon]) => (
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
                <Icon size={13} className="text-muted shrink-0" />
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

          <div className="flex gap-4 items-start">
            <div className="card overflow-hidden flex-1 min-w-0">
              <Map2D
                points={mapPoints}
                paths={(layers.flows || Boolean(selected)) ? mapPaths : []}
                areaPolygons={areaPolygons}
                corridors={corridors}
                maptilerKey={mapKey}
                showHeatmap={false}
                showPoints={layers.venues}
                showAreas={layers.areas}
                showCorridors={layers.corridors}
                showArrows={false}
                onAreaClick={(code) =>
                  setSelected(selected === code ? null : code)
                }
              />
            </div>

            {/* Postcode origins sidebar */}
            {postcodeNodesQuery.data && (
              <div className="card p-4 space-y-3 w-56 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="heading-sub text-xs">Postcode origins</h2>
                  {selected && (
                    <button
                      onClick={() => setSelected(null)}
                      className="btn-ghost text-[10px] text-muted"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {postcodeNodesQuery.data.postcode_nodes.map((n) => {
                    const chipColor = CORE_PLYMOUTH.has(n.code)
                      ? districtColor(postcodeNodesQuery.data.postcode_nodes, n.code)
                      : "#94a3b8";
                    return (
                      <button
                        key={n.code}
                        onClick={() => setSelected(selected === n.code ? null : n.code)}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          selected === n.code
                            ? "ring-2 ring-offset-1 ring-current"
                            : "opacity-80 hover:opacity-100"
                        }`}
                        style={{
                          background: chipColor + "22",
                          borderColor: chipColor,
                          color: chipColor,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: chipColor }}
                        />
                        <span className="flex-1 text-left">{n.code}</span>
                        <span className="opacity-60 tabular-nums">{n.total.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted leading-snug">
                  Click an area to highlight it. Darker = more activity.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
