import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  /** Active deck.gl layers; updates trigger overlay re-render. */
  layers: Layer[];
  /** Initial centre [lng, lat]. Defaults to Plymouth. */
  centre?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  /** MapTiler API key (required for the basemap). */
  maptilerKey: string;
  /** Optional fixed height (e.g. "70vh"). */
  height?: string;
  /** Called once the underlying MapLibre instance is ready (used for PNG export). */
  onMapReady?: (map: maplibregl.Map) => void;
}

/**
 * Reusable MapLibre + deck.gl overlay surface used by Map3D and Postcodes3D.
 *
 * MapLibre owns the basemap, deck.gl owns the data layers via the
 * MapboxOverlay (which works fine with MapLibre's near-identical API).
 */
export default function Deck3DMap({
  layers,
  centre = [-4.142, 50.371],
  zoom = 11,
  pitch = 45,
  bearing = -10,
  maptilerKey,
  height = "70vh",
  onMapReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Bootstrap map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
      center: centre,
      zoom,
      pitch,
      bearing,
      // Required so that getCanvas().toBlob() captures pixels rather than blank.
      ...({ preserveDrawingBuffer: true } as any),
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    const overlay = new MapboxOverlay({ layers });
    map.once("load", () => {
      map.addControl(overlay as unknown as maplibregl.IControl);
      onMapReady?.(map);
    });
    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maptilerKey]);

  // Push new layer set whenever it changes.
  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
