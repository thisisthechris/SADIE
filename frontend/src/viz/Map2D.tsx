import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPoint {
  id: number | string;
  lng: number;
  lat: number;
  /** Tooltip HTML (sanitised upstream — keep simple). */
  popupHtml?: string;
  /** Optional weight used to scale circle radius (1.0 = default). */
  weight?: number;
  /** Override fill colour (defaults to accent). */
  color?: string;
}

interface Props {
  points: MapPoint[];
  centre?: [number, number];
  zoom?: number;
  height?: string;
  maptilerKey: string;
  onMapReady?: (m: maplibregl.Map) => void;
  /** Default circle colour when a point doesn't specify one. */
  defaultColor?: string;
}

const SOURCE_ID = "map2d-points";
const LAYER_ID = "map2d-points-circles";

/**
 * Lightweight MapLibre + GeoJSON circle layer used by the 2D Map page.
 * Updates `points` cheaply via setData rather than re-creating the map.
 */
export default function Map2D({
  points,
  centre = [-4.142, 50.371],
  zoom = 11,
  height = "70vh",
  maptilerKey,
  onMapReady,
  defaultColor = "#60a5fa",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`,
      center: centre,
      zoom,
      ...({ preserveDrawingBuffer: true } as any),
    });
    map.addControl(new maplibregl.NavigationControl({}), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "weight"], 1],
            0, 4,
            10, 12,
            100, 22,
          ],
          "circle-color": ["coalesce", ["get", "color"], defaultColor],
          "circle-opacity": 0.75,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0f172a",
        },
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
      });
      popupRef.current = popup;

      map.on("mouseenter", LAYER_ID, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const html = (f.properties as any)?.popupHtml;
        if (!html) return;
        const c = (f.geometry as any).coordinates as [number, number];
        popup.setLngLat(c).setHTML(html).addTo(map);
      });
      map.on("mouseleave", LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      onMapReady?.(map);
    });

    mapRef.current = map;
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  // Push points -> source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: {
            id: p.id,
            weight: p.weight ?? 1,
            color: p.color,
            popupHtml: p.popupHtml ?? "",
          },
        })),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
