import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnLayer } from "@deck.gl/layers";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import Deck3DMap from "../viz/Deck3DMap";
import { downloadCanvasPng, downloadCsv } from "../lib/export";
export default function Postcodes3D() {
    const f = useFilters();
    const cfg = useConfig();
    const key = cfg.data?.maptiler_api_key ?? "";
    const mapRef = useRef(null);
    const q = useQuery({
        queryKey: ["viz-postcode-bars", f.asQuery()],
        queryFn: () => api("/api/analytics/viz/postcode-bars/", { query: f.asQuery() }),
    });
    const layers = useMemo(() => {
        const data = q.data?.results ?? [];
        const max = Math.max(1, ...data.map((d) => d.total));
        return [
            new ColumnLayer({
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
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Postcode Engagement (3D)" }), _jsx("p", { className: "text-sm text-muted", children: "Extruded bars at each Plymouth postcode-district centroid show total interaction volume. Cool \u2192 warm scales with relative engagement." })] }), _jsx(FilterBar, {}), _jsx("div", { className: "flex justify-end", children: _jsx(ExportMenu, { items: [
                        {
                            label: "PNG snapshot",
                            disabled: !mapRef.current,
                            onClick: () => {
                                const canvas = mapRef.current?.getCanvas();
                                if (canvas)
                                    downloadCanvasPng(canvas, "postcode-bars.png");
                            },
                        },
                        {
                            label: "CSV data",
                            disabled: !q.data?.results.length,
                            onClick: () => downloadCsv("postcode-bars.csv", q.data?.results ?? [], [
                                { key: "postcode", label: "Postcode" },
                                { key: "district", label: "District" },
                                { key: "area", label: "Area" },
                                { key: "total", label: "Total" },
                            ]),
                        },
                    ] }) }), !key ? (_jsxs("div", { className: "card p-6 text-sm text-muted", children: ["MapTiler key missing \u2014 set ", _jsx("code", { className: "font-mono", children: "MAPTILER_API_KEY" }), " and restart the web service."] })) : (_jsx("div", { className: "card overflow-hidden", children: _jsx(Deck3DMap, { layers: layers, maptilerKey: key, pitch: 55, zoom: 10, onMapReady: (m) => (mapRef.current = m) }) })), q.isLoading && _jsx("div", { className: "text-xs text-muted", children: "Loading postcode aggregates\u2026" }), q.data && (_jsxs("div", { className: "text-xs text-muted", children: [q.data.results.length, " postcode districts with engagement."] }))] }));
}
