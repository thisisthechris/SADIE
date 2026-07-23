import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnLayer } from "@deck.gl/layers";
import type maplibregl from "maplibre-gl";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import ExportMenu from "../components/ExportMenu";
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

interface Resp {
  results: Bar[];
}

export default function Postcodes3D() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const mapRef = useRef<maplibregl.Map | null>(null);

  const q = useQuery({
    queryKey: ["viz-postcode-bars", f.asQuery()],
    queryFn: () =>
      api<Resp>("/api/analytics/viz/postcode-bars/", { query: f.asQuery() }),
  });

  const layers = useMemo(() => {
    const data = q.data?.results ?? [];
    const max = Math.max(1, ...data.map((d) => d.total));
    return [
      new ColumnLayer<Bar>({
        id: "postcode-bars",
        data,
        getPosition: (d) => [d.lng, d.lat],
        getElevation: (d) => d.total,
        getFillColor: (d) => {
          const t = d.total / max;
          // Cool→warm gradient.
          return [60 + Math.round(195 * t), 80, 200 - Math.round(150 * t), 220];
        },
        elevationScale: 5,
        radius: 600,
        extruded: true,
        pickable: true,
        material: { ambient: 0.5, diffuse: 0.7, shininess: 16 },
      }),
    ];
  }, [q.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-main">Postcode Engagement (3D)</h1>
        <p className="body-lg">
          Extruded bars at each Plymouth postcode-district centroid show total
          interaction volume. Cool → warm scales with relative engagement.
        </p>
      </div>
      <div className="flex justify-end">
        <ExportMenu
          items={[
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
              disabled: !q.data?.results.length,
              onClick: () =>
                downloadCsv(
                  "postcode-bars.csv",
                  q.data?.results ?? [],
                  [
                    { key: "postcode", label: "Postcode" },
                    { key: "district", label: "District" },
                    { key: "area", label: "Area" },
                    { key: "total", label: "Total" },
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
            pitch={55}
            zoom={10}
            onMapReady={(m) => (mapRef.current = m)}
          />
        </div>
      )}
      {q.isLoading && <div className="text-xs text-muted">Loading postcode aggregates…</div>}
      {q.data && (
        <div className="text-xs text-muted">
          {q.data.results.length} postcode districts with engagement.
        </div>
      )}
    </div>
  );
}
