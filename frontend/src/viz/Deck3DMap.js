import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
/**
 * Reusable MapLibre + deck.gl overlay surface used by Map3D and Postcodes3D.
 *
 * MapLibre owns the basemap, deck.gl owns the data layers via the
 * MapboxOverlay (which works fine with MapLibre's near-identical API).
 */
export default function Deck3DMap({ layers, centre = [-4.142, 50.371], zoom = 11, pitch = 45, bearing = -10, maptilerKey, height = "70vh", onMapReady, }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const overlayRef = useRef(null);
    // Bootstrap map once.
    useEffect(() => {
        if (!containerRef.current || mapRef.current)
            return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
            center: centre,
            zoom,
            pitch,
            bearing,
            // Required so that getCanvas().toBlob() captures pixels rather than blank.
            ...{ preserveDrawingBuffer: true },
        });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
        const overlay = new MapboxOverlay({ layers });
        map.once("load", () => {
            map.addControl(overlay);
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
    return _jsx("div", { ref: containerRef, style: { width: "100%", height } });
}
