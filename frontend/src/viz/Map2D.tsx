import { useEffect, useRef, useState } from "react";
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

export interface HeatmapPoint {
  lng: number;
  lat: number;
  total: number;
  postcode_count?: number;
}

interface Props {
  points: MapPoint[];
  heatmapPoints?: HeatmapPoint[];
  centre?: [number, number];
  zoom?: number;
  height?: string;
  maptilerKey: string;
  onMapReady?: (m: maplibregl.Map) => void;
  /** Default circle colour when a point doesn't specify one. */
  defaultColor?: string;
  /** Show heatmap layer (default true if heatmapPoints provided) */
  showHeatmap?: boolean;
  /** Show circle layer for exact points (default true) */
  showPoints?: boolean;
  /** Show graduated bubble layer (proportional symbols) for clustered data */
  showClusters?: boolean;
}

const SOURCE_ID = "map2d-points";
const LAYER_ID = "map2d-points-circles";
const HEATMAP_SOURCE_ID = "map2d-heatmap";
const HEATMAP_LAYER_ID = "map2d-heatmap-layer";
const CLUSTER_CIRCLE_LAYER_ID = "map2d-cluster-circles";
const CLUSTER_LABEL_LAYER_ID = "map2d-cluster-labels";

/**
 * Lightweight MapLibre + GeoJSON visualization supporting both circle pins and heatmap layers.
 * Updates `points` and `heatmapPoints` cheaply via setData rather than re-creating the map.
 */
export default function Map2D({
  points,
  heatmapPoints,
  centre = [-4.142, 50.371],
  zoom = 11,
  height = "70vh",
  maptilerKey,
  onMapReady,
  defaultColor = "#60a5fa",
  showHeatmap = true,
  showPoints = true,
  showClusters = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    console.warn("[Map2D] Map useEffect called");
    if (!containerRef.current || mapRef.current) {
      console.warn("[Map2D] Returning early from map useEffect, container:", !!containerRef.current, "mapRef:", !!mapRef.current);
      return;
    }
    // Reset mapLoaded when creating a new map
    setMapLoaded(false);
    console.warn("[Map2D] Proceeding with map creation");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`,
      center: centre,
      zoom,
      ...({ preserveDrawingBuffer: true } as any),
    });
    console.warn("[Map2D] Map object created");
    map.addControl(new maplibregl.NavigationControl({}), "top-right");

    const loadHandler = () => {
      console.warn("[Map2D] Map load event fired");
      try {
        // Point source for exact pins
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        console.warn("[Map2D] Added points source");
        
        // Circle layer styled to look like pins
        map.addLayer({
          id: LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          layout: {
            "visibility": "visible",
          },
          paint: {
            "circle-radius": 7,
            "circle-color": ["coalesce", ["get", "color"], defaultColor],
            "circle-opacity": 0.85,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#fff",
            "circle-stroke-opacity": 0.9,
          },
        });
        console.warn("[Map2D] Added circle layer");

        // Heatmap source for clustered points
        map.addSource(HEATMAP_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        console.warn("[Map2D] Added heatmap source");
        
        map.addLayer({
          id: HEATMAP_LAYER_ID,
          type: "heatmap",
          source: HEATMAP_SOURCE_ID,
          layout: {
            "visibility": "visible",
          },
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "total"],
              0, 0,
              100, 1,
            ],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 1,
              9, 3,
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(0, 0, 255, 0)",
              0.1, "royalblue",
              0.3, "cyan",
              0.5, "lime",
              0.7, "yellow",
              1, "red",
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 2,
              9, 20,
            ],
            "heatmap-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 1,
              9, 0.8,
            ],
          },
        });
        console.warn("[Map2D] Added heatmap layer");

        // Graduated bubble (proportional symbol) layer — stays meaningful at
        // every zoom level because radius is tied to the data value, not pixel
        // density. Radius scales with sqrt(total) so circle *area* is
        // proportional to interaction count.
        map.addLayer({
          id: CLUSTER_CIRCLE_LAYER_ID,
          type: "circle",
          source: HEATMAP_SOURCE_ID,
          layout: {
            "visibility": "none",
          },
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, ["max", 4, ["*", ["sqrt", ["get", "total"]], 0.1]],
              14, ["max", 8, ["*", ["sqrt", ["get", "total"]], 0.3]],
            ],
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "total"],
              0, "#2c7fb8",
              500, "#41b6c4",
              2000, "#7fcdbb",
              5000, "#fecc5c",
              10000, "#fd8d3c",
              25000, "#e31a1c",
            ],
            "circle-opacity": 0.7,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.9,
          },
        });
        console.warn("[Map2D] Added cluster bubble layer");

        // Count labels rendered on top of larger bubbles.
        map.addLayer({
          id: CLUSTER_LABEL_LAYER_ID,
          type: "symbol",
          source: HEATMAP_SOURCE_ID,
          layout: {
            "visibility": "none",
            "text-field": [
              "case",
              [">=", ["get", "total"], 1000],
              ["concat", ["to-string", ["round", ["/", ["get", "total"], 1000]]], "k"],
              ["to-string", ["get", "total"]],
            ],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 9,
              14, 13,
            ],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#1f2937",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
        console.warn("[Map2D] Added cluster label layer");

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

        // Hover tooltips for bubble clusters.
        map.on("mouseenter", CLUSTER_CIRCLE_LAYER_ID, (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const props = f.properties as any;
          const total = Number(props?.total ?? 0).toLocaleString();
          const pcCount = props?.postcode_count ?? 0;
          const c = (f.geometry as any).coordinates as [number, number];
          popup
            .setLngLat(c)
            .setHTML(
              `<div class="text-sm"><div class="font-medium">${total} interactions</div><div>${pcCount} postcodes (grouped)</div></div>`,
            )
            .addTo(map);
        });
        map.on("mouseleave", CLUSTER_CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        console.warn("[Map2D] Initialization complete, setting mapLoaded");
        setMapLoaded(true);
        onMapReady?.(map);
      } catch (error) {
        console.error("[Map2D] Error in load handler:", error);
      }
    };
    
    map.on("load", loadHandler);
    console.warn("[Map2D] Registered load listener");

    mapRef.current = map;
    return () => {
      console.warn("[Map2D] Cleanup: Removing old map");
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  // Push points -> source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }
    
    let retryTimeout: NodeJS.Timeout | null = null;
    let active = true;
    
    const apply = () => {
      if (!active || !mapRef.current) return;
      try {
        const src = mapRef.current.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (!src) {
          console.warn(`[Map2D] Source ${SOURCE_ID} not found, retrying...`);
          retryTimeout = setTimeout(apply, 100);
          return;
        }
        console.warn(`[Map2D] Applying ${points.length} points to source`);
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
        
        // Ensure layer exists and set visibility
        if (mapRef.current.getLayer(LAYER_ID)) {
          mapRef.current.setLayoutProperty(LAYER_ID, "visibility", showPoints ? "visible" : "none");
        }
      } catch (err) {
        console.error("[Map2D] Error applying points:", err);
      }
    };
    
    // Try to apply immediately
    apply();
    
    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [points, mapLoaded, showPoints]);

  // Push heatmap points -> heatmap source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }

    let retryTimeout: NodeJS.Timeout | null = null;
    let active = true;
    
    const apply = () => {
      if (!active || !mapRef.current) return;
      try {
        const src = mapRef.current.getSource(HEATMAP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (!src) {
          console.warn(`[Map2D] Heatmap source ${HEATMAP_SOURCE_ID} not found, retrying...`);
          retryTimeout = setTimeout(apply, 100);
          return;
        }
        console.warn(`[Map2D] Applying ${heatmapPoints?.length ?? 0} heatmap points to source`);
        src.setData({
          type: "FeatureCollection",
          features: (heatmapPoints || []).map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: {
              total: p.total ?? 0,
              postcode_count: p.postcode_count ?? 0,
            },
          })),
        });

        // Ensure visibility is correct after data is loaded
        const hasClusters = Boolean(heatmapPoints && heatmapPoints.length > 0);
        if (mapRef.current.getLayer(HEATMAP_LAYER_ID)) {
          mapRef.current.setLayoutProperty(HEATMAP_LAYER_ID, "visibility", showHeatmap && hasClusters ? "visible" : "none");
        }
        if (mapRef.current.getLayer(CLUSTER_CIRCLE_LAYER_ID)) {
          mapRef.current.setLayoutProperty(CLUSTER_CIRCLE_LAYER_ID, "visibility", showClusters && hasClusters ? "visible" : "none");
        }
        if (mapRef.current.getLayer(CLUSTER_LABEL_LAYER_ID)) {
          mapRef.current.setLayoutProperty(CLUSTER_LABEL_LAYER_ID, "visibility", showClusters && hasClusters ? "visible" : "none");
        }
      } catch (err) {
        console.error("[Map2D] Error applying heatmap:", err);
      }
    };
    
    // Try to apply immediately
    apply();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [heatmapPoints, mapLoaded, showHeatmap, showClusters]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
