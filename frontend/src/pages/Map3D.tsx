import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import type maplibregl from "maplibre-gl";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import Deck3DMap from "../viz/Deck3DMap";
import { downloadCanvasPng, downloadCsv } from "../lib/export";

interface Point {
  location_id: number;
  name: string;
  organisation: string;
  lng: number;
  lat: number;
  event_count: number;
}

interface Resp {
  results: Point[];
}

export default function Map3D() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const mapRef = useRef<maplibregl.Map | null>(null);

  const q = useQuery({
    queryKey: ["viz-event-points", f.asQuery()],
    queryFn: () =>
      api<Resp>("/api/analytics/viz/event-points/", { query: f.asQuery() }),
  });

  const layers = useMemo(() => {
    const data = q.data?.results ?? [];
    return [
      new HexagonLayer<Point>({
        id: "event-hex",
        data,
        getPosition: (d) => [d.lng, d.lat],
        getElevationWeight: (d) => d.event_count,
        elevationAggregation: "SUM",
        radius: 250,
        elevationScale: 30,
        extruded: true,
        coverage: 0.85,
        pickable: true,
        material: {
          ambient: 0.6,
          diffuse: 0.6,
          shininess: 32,
          specularColor: [60, 64, 70],
        },
      }),
    ];
  }, [q.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">3D Event Density</h1>
        <p className="text-sm text-muted">
          Hex-binned event counts across Plymouth venues. Bars rise with
          activity; hover for venue totals. Filters apply globally.
        </p>
      </div>
      <FilterBar />
      <div className="flex justify-end">
        <ExportMenu
          items={[
            {
              label: "PNG snapshot",
              disabled: !mapRef.current,
              onClick: () => {
                const canvas = mapRef.current?.getCanvas();
                if (canvas) downloadCanvasPng(canvas, "event-density.png");
              },
            },
            {
              label: "CSV data",
              disabled: !q.data?.results.length,
              onClick: () =>
                downloadCsv(
                  "event-points.csv",
                  q.data?.results ?? [],
                  [
                    { key: "name", label: "Venue" },
                    { key: "organisation", label: "Organisation" },
                    { key: "lat", label: "Lat" },
                    { key: "lng", label: "Lng" },
                    { key: "event_count", label: "Events" },
                  ],
                ),
            },
          ]}
        />
      </div>
      {!key ? (
        <div className="card p-6 text-sm text-muted">
          MapTiler key missing — set <code className="font-mono">MAPTILER_API_KEY</code> and restart the web service.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Deck3DMap
            layers={layers}
            maptilerKey={key}
            onMapReady={(m) => (mapRef.current = m)}
          />
        </div>
      )}
      {q.isLoading && <div className="text-xs text-muted">Loading event points…</div>}
      {q.data && (
        <div className="text-xs text-muted">
          {q.data.results.length} venues with events for current filters.
        </div>
      )}
    </div>
  );
}
