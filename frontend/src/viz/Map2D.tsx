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

export interface MapPath {
  id: number | string;
  /** Ordered [lng, lat] coordinates forming the line. */
  coordinates: [number, number][];
  /** Line colour (defaults to accent). */
  color?: string;
  /** Line width in px (defaults to 3). */
  width?: number;
  /** Line opacity 0–1 (defaults to 0.8). */
  opacity?: number;
  /** Tooltip HTML shown on hover (sanitised upstream — keep simple). */
  popupHtml?: string;
}

/**
 * A GeoJSON FeatureCollection of area polygons (e.g. postcode-district
 * boundaries). Per-feature `properties` may carry `color`, `fillOpacity`,
 * `selected`, `code` and `popupHtml` to drive styling/interaction.
 */
export type AreaFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
};

/**
 * A GeoJSON FeatureCollection of transport corridors. Line/MultiLine features
 * are drawn as corridors; Point features are drawn as markers (e.g. park &
 * ride sites). Per-feature `properties` may carry `color`, `width`, `opacity`
 * and `popupHtml`.
 */
export type CorridorFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
};

interface Props {
  points: MapPoint[];
  heatmapPoints?: HeatmapPoint[];
  /** Optional polylines (journey paths, venue→venue flows). */
  paths?: MapPath[];
  /** Optional filled area polygons (postcode-district boundaries). */
  areaPolygons?: AreaFeatureCollection;
  /** Optional public-transport corridors (lines) + markers (points). */
  corridors?: CorridorFeatureCollection;
  centre?: [number, number];
  zoom?: number;
  height?: string;
  maptilerKey: string;
  onMapReady?: (m: maplibregl.Map) => void;
  /** Called with a polygon's `code` property when an area is clicked. */
  onAreaClick?: (code: string) => void;
  /** Default circle colour when a point doesn't specify one. */
  defaultColor?: string;
  /** Show heatmap layer (default true if heatmapPoints provided) */
  showHeatmap?: boolean;
  /** Show circle layer for exact points (default true) */
  showPoints?: boolean;
  /** Show graduated bubble layer (proportional symbols) for clustered data */
  showClusters?: boolean;
  /** Show area polygon fill/outline layers (default true) */
  showAreas?: boolean;
  /** Show transport corridor line/marker layers (default true) */
  showCorridors?: boolean;
  /** Show direction arrows on path/flow lines (default true) */
  showArrows?: boolean;
}

const SOURCE_ID = "map2d-points";
const LAYER_ID = "map2d-points-circles";
const HEATMAP_SOURCE_ID = "map2d-heatmap";
const HEATMAP_LAYER_ID = "map2d-heatmap-layer";
const CLUSTER_CIRCLE_LAYER_ID = "map2d-cluster-circles";
const CLUSTER_LABEL_LAYER_ID = "map2d-cluster-labels";
const PATH_SOURCE_ID = "map2d-paths";
const PATH_LAYER_ID = "map2d-paths-lines";
const AREA_SOURCE_ID = "map2d-areas";
const AREA_FILL_LAYER_ID = "map2d-areas-fill";
const AREA_LINE_LAYER_ID = "map2d-areas-line";
const CORRIDOR_SOURCE_ID = "map2d-corridors";
const CORRIDOR_LINE_LAYER_ID = "map2d-corridors-line";
const CORRIDOR_POINT_LAYER_ID = "map2d-corridors-points";

/**
 * Lightweight MapLibre + GeoJSON visualization supporting both circle pins and heatmap layers.
 * Updates `points` and `heatmapPoints` cheaply via setData rather than re-creating the map.
 */
export default function Map2D({
  points,
  heatmapPoints,
  paths,
  areaPolygons,
  corridors,
  centre = [-4.142, 50.371],
  zoom = 11,
  height = "70vh",
  maptilerKey,
  onMapReady,
  onAreaClick,
  defaultColor = "#60a5fa",
  showHeatmap = true,
  showPoints = true,
  showClusters = false,
  showAreas = true,
  showCorridors = true,
  showArrows = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Keep the latest onAreaClick without re-creating the map (empty-deps effect).
  const onAreaClickRef = useRef(onAreaClick);
  onAreaClickRef.current = onAreaClick;

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
        // ── Area polygons (postcode districts) — added first so they sit at
        // the bottom of the stack, beneath corridors, flows and pins. ──
        map.addSource(AREA_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: AREA_FILL_LAYER_ID,
          type: "fill",
          source: AREA_SOURCE_ID,
          layout: { "visibility": "visible" },
          paint: {
            "fill-color": ["coalesce", ["get", "color"], defaultColor],
            "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.3],
          },
        });
        map.addLayer({
          id: AREA_LINE_LAYER_ID,
          type: "line",
          source: AREA_SOURCE_ID,
          layout: { "visibility": "visible", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#334155"],
            "line-width": ["case", ["boolean", ["get", "selected"], false], 3.5, 1],
            "line-opacity": 0.9,
          },
        });
        console.warn("[Map2D] Added area layers");

        // ── Public-transport corridors: lines for routes, circles for P&R. ──
        map.addSource(CORRIDOR_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: CORRIDOR_LINE_LAYER_ID,
          type: "line",
          source: CORRIDOR_SOURCE_ID,
          filter: ["!=", ["geometry-type"], "Point"],
          layout: { "visibility": "visible", "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#0ea5e9"],
            "line-width": ["coalesce", ["get", "width"], 2.5],
            "line-opacity": ["coalesce", ["get", "opacity"], 0.85],
          },
        });
        map.addLayer({
          id: CORRIDOR_POINT_LAYER_ID,
          type: "circle",
          source: CORRIDOR_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Point"],
          layout: { "visibility": "visible" },
          paint: {
            "circle-radius": 6,
            "circle-color": ["coalesce", ["get", "color"], "#f59e0b"],
            "circle-opacity": 0.95,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        console.warn("[Map2D] Added corridor layers");

        // Path source + line layer for journeys / flows. Added before the
        // point layers so pins render on top of the lines.
        map.addSource(PATH_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: PATH_LAYER_ID,
          type: "line",
          source: PATH_SOURCE_ID,
          layout: {
            "visibility": "visible",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": ["coalesce", ["get", "color"], defaultColor],
            "line-width": ["coalesce", ["get", "width"], 3],
            "line-opacity": ["coalesce", ["get", "opacity"], 0.8],
          },
        });

        // Canvas-drawn chevron arrow for clear directional indication on flow lines.
        const ARROW_SIZE = 24;
        const arrowCanvas = document.createElement("canvas");
        arrowCanvas.width = ARROW_SIZE;
        arrowCanvas.height = ARROW_SIZE;
        const arrowCtx = arrowCanvas.getContext("2d")!;
        arrowCtx.clearRect(0, 0, ARROW_SIZE, ARROW_SIZE);
        arrowCtx.strokeStyle = "white";
        arrowCtx.lineWidth = 4;
        arrowCtx.lineCap = "round";
        arrowCtx.lineJoin = "round";
        arrowCtx.beginPath();
        arrowCtx.moveTo(5, 4);
        arrowCtx.lineTo(ARROW_SIZE - 5, ARROW_SIZE / 2);
        arrowCtx.lineTo(5, ARROW_SIZE - 4);
        arrowCtx.stroke();
        const arrowPixels = arrowCtx.getImageData(0, 0, ARROW_SIZE, ARROW_SIZE);
        map.addImage(
          "flow-arrow",
          { width: ARROW_SIZE, height: ARROW_SIZE, data: new Uint8Array(arrowPixels.data.buffer) },
          { sdf: true },
        );

        // Arrow symbols along each path line to show direction.
        map.addLayer({
          id: `${PATH_LAYER_ID}-arrows`,
          type: "symbol",
          source: PATH_SOURCE_ID,
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 120,
            "icon-image": "flow-arrow",
            "icon-size": 1,
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "viewport",
            "icon-allow-overlap": true,
          },
          paint: {
            "icon-color": ["coalesce", ["get", "color"], defaultColor],
            "icon-opacity": ["coalesce", ["get", "opacity"], 0.8],
            "icon-halo-color": "rgba(255,255,255,0.5)",
            "icon-halo-width": 1.5,
          },
        });
        console.warn("[Map2D] Added path layer");

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
            "circle-radius": 4,
            "circle-color": ["coalesce", ["get", "color"], defaultColor],
            "circle-opacity": 0.9,
            "circle-stroke-width": 1.5,
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

        // Hover tooltips for path lines.
        map.on("mouseenter", PATH_LAYER_ID, (e) => {
          const f = e.features?.[0];
          const html = (f?.properties as any)?.popupHtml;
          if (!html) return;
          map.getCanvas().style.cursor = "pointer";
          popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        });
        map.on("mousemove", PATH_LAYER_ID, (e) => {
          const f = e.features?.[0];
          const html = (f?.properties as any)?.popupHtml;
          if (!html) return;
          popup.setLngLat(e.lngLat).setHTML(html);
        });
        map.on("mouseleave", PATH_LAYER_ID, () => {
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

        // Hover + click for area polygons.
        // Skip if the cursor is over a venue point (circle layer has visual priority).
        map.on("mousemove", AREA_FILL_LAYER_ID, (e) => {
          const overPoint = map.queryRenderedFeatures(e.point, { layers: [LAYER_ID] }).length > 0;
          if (overPoint) return;
          map.getCanvas().style.cursor = "pointer";
          const html = (e.features?.[0]?.properties as any)?.popupHtml;
          if (html) popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        });
        map.on("mouseleave", AREA_FILL_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", AREA_FILL_LAYER_ID, (e) => {
          const code = (e.features?.[0]?.properties as any)?.code;
          if (code != null) onAreaClickRef.current?.(String(code));
        });

        // Hover tooltips for corridor lines.
        map.on("mousemove", CORRIDOR_LINE_LAYER_ID, (e) => {
          map.getCanvas().style.cursor = "pointer";
          const html = (e.features?.[0]?.properties as any)?.popupHtml;
          if (html) popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        });
        map.on("mouseleave", CORRIDOR_LINE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        // Hover tooltips for corridor markers (park & ride sites).
        map.on("mouseenter", CORRIDOR_POINT_LAYER_ID, (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          const html = (f?.properties as any)?.popupHtml;
          if (html && f) {
            const c = (f.geometry as any).coordinates as [number, number];
            popup.setLngLat(c).setHTML(html).addTo(map);
          }
        });
        map.on("mouseleave", CORRIDOR_POINT_LAYER_ID, () => {
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
  }, [points, mapLoaded]);

  // Push paths -> path source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const apply = () => {
      if (!active || !mapRef.current) return;
      try {
        const src = mapRef.current.getSource(PATH_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!src) {
          retryTimeout = setTimeout(apply, 100);
          return;
        }
        src.setData({
          type: "FeatureCollection",
          features: (paths ?? []).map((p) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: p.coordinates },
            properties: {
              id: p.id,
              color: p.color,
              width: p.width,
              opacity: p.opacity,
              popupHtml: p.popupHtml ?? "",
            },
          })),
        });
      } catch (err) {
        console.error("[Map2D] Error applying paths:", err);
      }
    };

    apply();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [paths, mapLoaded]);

  // Toggle arrow symbol layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const vis = showArrows ? "visible" : "none";
    if (map.getLayer(`${PATH_LAYER_ID}-arrows`)) {
      map.setLayoutProperty(`${PATH_LAYER_ID}-arrows`, "visibility", vis);
    }
  }, [showArrows, mapLoaded]);

  // Push area polygons -> area source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const apply = () => {
      if (!active || !mapRef.current) return;
      try {
        const src = mapRef.current.getSource(AREA_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!src) {
          retryTimeout = setTimeout(apply, 100);
          return;
        }
        src.setData(
          (areaPolygons ?? { type: "FeatureCollection", features: [] }) as any,
        );
        const vis = showAreas ? "visible" : "none";
        for (const id of [AREA_FILL_LAYER_ID, AREA_LINE_LAYER_ID]) {
          if (mapRef.current.getLayer(id)) {
            mapRef.current.setLayoutProperty(id, "visibility", vis);
          }
        }
      } catch (err) {
        console.error("[Map2D] Error applying areas:", err);
      }
    };

    apply();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [areaPolygons, mapLoaded, showAreas]);

  // Push transport corridors -> corridor source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const apply = () => {
      if (!active || !mapRef.current) return;
      try {
        const src = mapRef.current.getSource(CORRIDOR_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!src) {
          retryTimeout = setTimeout(apply, 100);
          return;
        }
        src.setData(
          (corridors ?? { type: "FeatureCollection", features: [] }) as any,
        );
        const vis = showCorridors ? "visible" : "none";
        for (const id of [CORRIDOR_LINE_LAYER_ID, CORRIDOR_POINT_LAYER_ID]) {
          if (mapRef.current.getLayer(id)) {
            mapRef.current.setLayoutProperty(id, "visibility", vis);
          }
        }
      } catch (err) {
        console.error("[Map2D] Error applying corridors:", err);
      }
    };

    apply();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [corridors, mapLoaded, showCorridors]);

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
  }, [heatmapPoints, mapLoaded]);

  // Dedicated visibility effects — respond immediately to toggle changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer(LAYER_ID))
      map.setLayoutProperty(LAYER_ID, "visibility", showPoints ? "visible" : "none");
  }, [showPoints, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer(HEATMAP_LAYER_ID))
      map.setLayoutProperty(HEATMAP_LAYER_ID, "visibility", showHeatmap ? "visible" : "none");
  }, [showHeatmap, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    for (const id of [CLUSTER_CIRCLE_LAYER_ID, CLUSTER_LABEL_LAYER_ID]) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", showClusters ? "visible" : "none");
    }
  }, [showClusters, mapLoaded]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
