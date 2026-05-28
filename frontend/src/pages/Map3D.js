import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import Deck3DMap from "../viz/Deck3DMap";
import { downloadCanvasPng, downloadCsv } from "../lib/export";
export default function Map3D() {
    const f = useFilters();
    const cfg = useConfig();
    const key = cfg.data?.maptiler_api_key ?? "";
    const mapRef = useRef(null);
    const q = useQuery({
        queryKey: ["viz-event-points", f.asQuery()],
        queryFn: () => api("/api/analytics/viz/event-points/", { query: f.asQuery() }),
    });
    const layers = useMemo(() => {
        const data = q.data?.results ?? [];
        return [
            new HexagonLayer({
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
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "3D Event Density" }), _jsx("p", { className: "text-sm text-muted", children: "Hex-binned event counts across Plymouth venues. Bars rise with activity; hover for venue totals. Filters apply globally." })] }), _jsx(FilterBar, {}), _jsx("div", { className: "flex justify-end", children: _jsx(ExportMenu, { items: [
                        {
                            label: "PNG snapshot",
                            disabled: !mapRef.current,
                            onClick: () => {
                                const canvas = mapRef.current?.getCanvas();
                                if (canvas)
                                    downloadCanvasPng(canvas, "event-density.png");
                            },
                        },
                        {
                            label: "CSV data",
                            disabled: !q.data?.results.length,
                            onClick: () => downloadCsv("event-points.csv", q.data?.results ?? [], [
                                { key: "name", label: "Venue" },
                                { key: "organisation", label: "Organisation" },
                                { key: "lat", label: "Lat" },
                                { key: "lng", label: "Lng" },
                                { key: "event_count", label: "Events" },
                            ]),
                        },
                    ] }) }), !key ? (_jsxs("div", { className: "card p-6 text-sm text-muted", children: ["MapTiler key missing \u2014 set ", _jsx("code", { className: "font-mono", children: "MAPTILER_API_KEY" }), " and restart the web service."] })) : (_jsx("div", { className: "card overflow-hidden", children: _jsx(Deck3DMap, { layers: layers, maptilerKey: key, onMapReady: (m) => (mapRef.current = m) }) })), q.isLoading && _jsx("div", { className: "text-xs text-muted", children: "Loading event points\u2026" }), q.data && (_jsxs("div", { className: "text-xs text-muted", children: [q.data.results.length, " venues with events for current filters."] }))] }));
}
