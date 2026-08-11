import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Map as MapIcon, Route, ArrowLeftRight, MapPin, Share2, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig, useMe } from "../lib/auth";import OrgToggle from "../components/OrgToggle";import Map2D, {
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
  type TicketDistrictsResp,
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
    sankey: false,
  });

  // Choropleth metric: aggregate interaction counts (default) or per-purchase
  // ticket volume (average party size / group bookings).
  const [metric, setMetric] = useState<"interactions" | "tickets">("interactions");

  // District summary — needed to merge totals into polygon colours.
  const summary = useQuery({
    queryKey: ["postcode-districts", q],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", { query: q }),
    staleTime: 5 * 60_000,
  });
  const districts: District[] = summary.data?.districts ?? [];

  // Ticket-volume district totals — only fetched when that metric is active.
  const ticketDistrictsQuery = useQuery({
    queryKey: ["postcode-ticket-districts", q],
    queryFn: () =>
      api<TicketDistrictsResp>("/api/analytics/viz/postcode-ticket-districts/", { query: q }),
    enabled: metric === "tickets",
    staleTime: 5 * 60_000,
  });

  // Postcode → venue flows (used to filter venue-to-venue paths when a district is selected).
  const postcodeNodesQuery = useQuery({
    queryKey: ["postcode-flows-nodes", q],
    queryFn: () =>
      api<FlowsResp>("/api/analytics/viz/postcode-flows/", { query: q }),
    staleTime: 5 * 60_000,
  });

  // Venue-to-venue flow paths derived from POSTCODE cohorts (mirrors the user
  // journeys model but sourced from postcode→event uploads, not individual users).
  // When a district is selected the endpoint scopes the connections to that
  // postcode's cohort, so clicking an area filters the pathways.
  const venueFlowsQuery = useQuery({
    queryKey: ["postcode-pathways", q, selected],
    queryFn: () =>
      api<VenueFlowsResp>("/api/analytics/viz/postcode-pathways/", {
        query: selected ? { ...q, district: selected } : q,
      }),
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

  // Merge interaction/ticket totals into boundary polygons: colour + opacity + popup.
  // "Interactions" keeps the existing per-district rainbow palette; "Ticket volume"
  // uses a single rose/pink tint (matching the ticket charts elsewhere in the app)
  // so switching metrics is visually obvious even when the shading pattern is similar.
  const TICKET_TINT = "#ec4899";
  const areaPolygons = useMemo<AreaFeatureCollection | undefined>(() => {
    const fc = boundariesQuery.data;
    if (!fc?.features) return undefined;

    const ticketByCode = new Map(
      (ticketDistrictsQuery.data?.districts ?? []).map((d) => [d.code, d]),
    );
    const totalByCode = new Map(
      metric === "tickets"
        ? districts.map((d) => [d.code, ticketByCode.get(d.code)?.total_tickets ?? 0])
        : districts.map((d) => [d.code, d.total]),
    );
    const maxTotal = Math.max(...Array.from(totalByCode.values()), 1);
    return {
      type: "FeatureCollection",
      features: fc.features.map((ft) => {
        const props = (ft.properties ?? {}) as Record<string, unknown>;
        const code = String(props.district ?? props.code ?? "");
        const name = props.name ? String(props.name) : "";
        const total = totalByCode.get(code) ?? 0;
        const ticketInfo = ticketByCode.get(code);
        const popupLabel =
          metric === "tickets"
            ? `${total.toLocaleString()} tickets${
                ticketInfo ? ` · avg party ${ticketInfo.avg_party_size}` : ""
              }`
            : `${total.toLocaleString()} interactions`;
        const isCore = CORE_PLYMOUTH.has(code);
        return {
          ...ft,
          properties: {
            ...props,
            code,
            total,
            color: isCore
              ? metric === "tickets"
                ? TICKET_TINT
                : districtColor(districts, code)
              : "#94a3b8",
            selected: selected === code,
            // Lightened ceiling — this was previously reported as "too dark":
            // max opacity capped around 0.55 (unselected) / 0.7 (selected)
            // instead of 0.75–0.85, so the basemap stays legible underneath.
            fillOpacity: selected
              ? selected === code
                ? Math.min(0.7, 0.3 + 0.4 * (total / maxTotal))          // selected: 0.30–0.70
                : total > 0 ? 0.03 + 0.05 * (total / maxTotal) : 0.04   // others: nearly invisible
              : total > 0 ? 0.1 + 0.45 * (total / maxTotal) : 0.08,     // none selected: 0.10–0.55
            popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(code)}${name ? ` · ${escHtml(name)}` : ""}</div><div>${popupLabel}</div></div>`,
          },
        };
      }),
    };
  }, [boundariesQuery.data, districts, selected, metric, ticketDistrictsQuery.data]);

  // Total across core Plymouth districts for the active metric — shown next
  // to the toggle so switching between Interactions/Ticket volume gives
  // explicit numeric feedback even when the map shading looks similar.
  const metricTotal = useMemo(() => {
    if (metric === "tickets") {
      return (ticketDistrictsQuery.data?.districts ?? [])
        .filter((d) => CORE_PLYMOUTH.has(d.code))
        .reduce((s, d) => s + d.total_tickets, 0);
    }
    return districts.filter((d) => CORE_PLYMOUTH.has(d.code)).reduce((s, d) => s + d.total, 0);
  }, [metric, districts, ticketDistrictsQuery.data]);

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
    const vfd = venueFlowsQuery.data;

    const paths: MapPath[] = [];

    if (vfd?.flows.length) {
      // Draw connections BETWEEN venues (never from the postcode centroid — that
      // is the separate "Visitor origins" Sankey layer). When a postcode is
      // selected the endpoint has already scoped these flows to that cohort.
      const nodeById = new Map(vfd.nodes.map((n) => [n.location_id, n]));

      // Normalise by share of total rather than relative to the local max.
      // This keeps shading stable when switching between postcode filters so
      // you can visually compare how strong each pathway is across selections.
      const total = vfd.flows.reduce((s, fl) => s + fl.count, 0) || 1;
      for (const fl of vfd.flows) {
        const a = nodeById.get(fl.from_id);
        const b = nodeById.get(fl.to_id);
        if (!a || !b) continue;
        const share = fl.count / total;           // fraction of dataset (0–1)
        const vis = Math.min(1, share * 8);       // scale up so minority flows are still visible
        paths.push({
          id: `v-${fl.from_id}-${fl.to_id}`,
          coordinates: [[a.lng, a.lat], [b.lng, b.lat]],
          color: "#2563eb",
          width: 2 + vis * 5,
          opacity: 0.1 + vis * 0.8,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_name)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors (${(share * 100).toFixed(1)}%)</div></div>`,
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
  }, [venueFlowsQuery.data, f.org, myOrgIds]);

  // Sankey-style paths: postcode centroid → venue, width proportional to visitor count.
  // Only rendered when a district is selected — showing all-origins lines when nothing
  // is selected creates visual noise and is confusing when deselecting.
  const sankeyPaths = useMemo<MapPath[]>(() => {
    const pcd = postcodeNodesQuery.data;
    if (!selected || !pcd?.flows?.length) return [];

    const selectedFlows = pcd.flows.filter((fl) => fl.from_code === selected);

    const max = Math.max(...selectedFlows.map((fl) => fl.count), 1);
    return selectedFlows.map((fl) => {
      const frac = fl.count / max;
      return {
        id: `sk-${fl.from_code}-${fl.to_location_id}`,
        coordinates: [[fl.from_lng, fl.from_lat], [fl.to_lng, fl.to_lat]] as [[number, number], [number, number]],
        color: CORE_PLYMOUTH.has(fl.from_code)
          ? districtColor(districts, fl.from_code)
          : "#94a3b8",
        width: 0.5 + frac * 4,
        opacity: 0.25 + frac * 0.55,
        popupHtml: `<div class="text-xs"><div class="font-semibold">${escHtml(fl.from_code)} → ${escHtml(fl.to_name)}</div><div>${fl.count.toLocaleString()} visitors</div></div>`,
      };
    });
  }, [postcodeNodesQuery.data, selected, districts]);

  return (
    <div className="space-y-6">
      {/* Header + tab nav */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Postcode Pathways</h1>
          <p className="body-lg">
            PL postcode district boundaries coloured by visitor activity, with
            Plymouth public-transport corridors and venue-to-venue pathways
            built from the order in which postcode cohorts attend events.
          </p>
        </div>
        <OrgToggle />
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
                ["sankey",    "Visitor origins",      Share2        ],
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

            {/* Choropleth metric toggle */}
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium">
              <button
                onClick={() => setMetric("interactions")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  metric === "interactions"
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Interactions
              </button>
              <button
                onClick={() => setMetric("tickets")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  metric === "tickets"
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Ticket volume
              </button>
            </div>
            <span className="text-xs text-muted">
              Showing{" "}
              <strong className="font-semibold text-foreground">
                {metricTotal.toLocaleString()}
              </strong>{" "}
              {metric === "tickets" ? "tickets" : "interactions"} across Plymouth districts
            </span>

            <div className="flex flex-wrap items-center gap-3 ml-auto">
              {Object.entries(MODE_LABELS).map(([mode, label]) => (
                <span
                  key={mode}
                  className="inline-flex items-center gap-1.5 text-xs text-muted"
                >
                  <span
                    className={`rounded-full shrink-0 ${mode === "park_ride" ? "w-2.5 h-2.5" : "w-3.5 h-1"}`}
                    style={{ background: MODE_COLORS[mode] }}
                  />
                  {label}{mode === "park_ride" ? " sites" : " routes"}
                </span>
              ))}
              <span className="text-xs text-muted/70 border-l border-border pl-3">
                Amber dots on map = Park &amp; Ride stops
              </span>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="card overflow-hidden flex-1 min-w-0">
              <Map2D
                points={mapPoints}
                paths={[
                  ...(layers.sankey ? sankeyPaths : []),
                  ...(layers.flows ? mapPaths : []),
                ]}
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
