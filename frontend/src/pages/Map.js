import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import Map2D from "../viz/Map2D";
import { downloadCsv } from "../lib/export";
export default function MapPage() {
    const f = useFilters();
    const cfg = useConfig();
    const key = cfg.data?.maptiler_api_key ?? "";
    const q = f.asQuery();
    const [mode, setMode] = useState("venues");
    const venues = useQuery({
        queryKey: ["map-venues", q],
        queryFn: () => api("/api/analytics/viz/event-points/", {
            query: q,
        }),
        enabled: mode === "venues",
    });
    const events = useQuery({
        queryKey: ["map-events", q],
        queryFn: () => api("/api/analytics/viz/event-list/", { query: { ...q, limit: "1000" } }),
        enabled: mode === "events",
    });
    const eventTimes = useMemo(() => {
        const rows = events.data?.results ?? [];
        const ts = rows
            .map((r) => (r.start ? new Date(r.start).getTime() : NaN))
            .filter((n) => !Number.isNaN(n));
        if (!ts.length)
            return null;
        return { min: Math.min(...ts), max: Math.max(...ts) };
    }, [events.data]);
    const [windowDays, setWindowDays] = useState(7);
    const [offsetDays, setOffsetDays] = useState(0);
    const eventPoints = useMemo(() => {
        if (mode !== "events" || !events.data)
            return [];
        const rows = events.data.results;
        if (!eventTimes)
            return rows.map(makeEventPoint);
        const startMs = eventTimes.min + offsetDays * 86_400_000;
        const endMs = startMs + windowDays * 86_400_000;
        return rows
            .filter((r) => {
            if (!r.start)
                return false;
            const t = new Date(r.start).getTime();
            return t >= startMs && t <= endMs;
        })
            .map(makeEventPoint);
    }, [mode, events.data, eventTimes, offsetDays, windowDays]);
    const venuePoints = useMemo(() => {
        if (mode !== "venues" || !venues.data)
            return [];
        return venues.data.results.map((v) => ({
            id: v.location_id,
            lng: v.lng,
            lat: v.lat,
            weight: v.event_count,
            color: "#34d399",
            popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(v.name)}</div><div>${escapeHtml(v.organisation)}</div><div class="mt-1">${v.event_count} event${v.event_count === 1 ? "" : "s"}</div></div>`,
        }));
    }, [mode, venues.data]);
    const points = mode === "venues" ? venuePoints : eventPoints;
    const totalRangeDays = eventTimes
        ? Math.max(1, Math.ceil((eventTimes.max - eventTimes.min) / 86_400_000))
        : 0;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Map" }), _jsx("p", { className: "text-sm text-muted", children: "Geographic exploration of venues and individual events." })] }), _jsxs("div", { className: "inline-flex rounded-md border border-border overflow-hidden text-sm", children: [_jsx(ModeButton, { current: mode, value: "venues", set: setMode, children: "Venues" }), _jsx(ModeButton, { current: mode, value: "events", set: setMode, children: "Events" })] })] }), _jsx(FilterBar, {}), mode === "events" && eventTimes && (_jsxs("div", { className: "card p-4 space-y-3", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs text-muted", children: [_jsxs("div", { children: ["Showing events from", " ", _jsx("span", { className: "text-fg font-medium", children: fmt(eventTimes.min + offsetDays * 86_400_000) }), " ", "to", " ", _jsx("span", { className: "text-fg font-medium", children: fmt(eventTimes.min + (offsetDays + windowDays) * 86_400_000) })] }), _jsxs("div", { children: [eventPoints.length, " of ", events.data?.count ?? 0, " events"] })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-xs text-muted mb-1", children: ["Start offset (", offsetDays, " day", offsetDays === 1 ? "" : "s", ")"] }), _jsx("input", { type: "range", min: 0, max: Math.max(0, totalRangeDays - 1), step: 1, value: offsetDays, onChange: (e) => setOffsetDays(parseInt(e.target.value, 10)), className: "w-full" })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-xs text-muted mb-1", children: ["Window (", windowDays, " day", windowDays === 1 ? "" : "s", ")"] }), _jsx("input", { type: "range", min: 1, max: Math.max(1, totalRangeDays), step: 1, value: windowDays, onChange: (e) => setWindowDays(parseInt(e.target.value, 10)), className: "w-full" })] })] })), _jsx("div", { className: "flex justify-end", children: _jsx(ExportMenu, { items: mode === "venues"
                        ? [
                            {
                                label: "CSV venues",
                                disabled: !venues.data?.results.length,
                                onClick: () => downloadCsv("map-venues.csv", venues.data?.results ?? [], [
                                    { key: "name", label: "Venue" },
                                    { key: "organisation", label: "Organisation" },
                                    { key: "lat", label: "Lat" },
                                    { key: "lng", label: "Lng" },
                                    { key: "event_count", label: "Events" },
                                ]),
                            },
                        ]
                        : [
                            {
                                label: "CSV events (visible)",
                                disabled: !eventPoints.length,
                                onClick: () => {
                                    const ids = new Set(eventPoints.map((p) => p.id));
                                    const rows = (events.data?.results ?? []).filter((r) => ids.has(r.id));
                                    downloadCsv("map-events.csv", rows, [
                                        { key: "title", label: "Event" },
                                        { key: "organisation", label: "Organisation" },
                                        { key: "location_name", label: "Venue" },
                                        { key: "start", label: "Start" },
                                        { key: "lat", label: "Lat" },
                                        { key: "lng", label: "Lng" },
                                        { key: "url", label: "URL" },
                                    ]);
                                },
                            },
                        ] }) }), !key ? (_jsxs("div", { className: "card p-6 text-sm text-muted", children: ["MapTiler key missing \u2014 set", " ", _jsx("code", { className: "font-mono", children: "MAPTILER_API_KEY" }), " and restart the web service."] })) : (_jsx("div", { className: "card overflow-hidden", children: _jsx(Map2D, { points: points, maptilerKey: key, defaultColor: mode === "venues" ? "#34d399" : "#60a5fa" }) })), _jsxs("div", { className: "text-xs text-muted", children: [mode === "venues" && venues.isLoading && "Loading venues…", mode === "events" && events.isLoading && "Loading events…", mode === "venues" && venues.data && (_jsxs(_Fragment, { children: [venues.data.results.length, " venues for current filters."] })), mode === "events" && events.data && !eventTimes && (_jsx(_Fragment, { children: "No events in current filter window." }))] })] }));
}
function ModeButton({ current, value, set, children, }) {
    const active = current === value;
    return (_jsx("button", { type: "button", onClick: () => set(value), className: "px-3 py-1.5 " +
            (active
                ? "bg-border/40 text-fg font-medium"
                : "text-muted hover:bg-border/20"), children: children }));
}
function makeEventPoint(r) {
    return {
        id: r.id,
        lng: r.lng,
        lat: r.lat,
        weight: 4,
        color: "#60a5fa",
        popupHtml: `<div class="text-xs max-w-[220px]"><div class="font-semibold">${escapeHtml(r.title)}</div><div>${escapeHtml(r.organisation)}${r.location_name ? " · " + escapeHtml(r.location_name) : ""}</div>${r.start
            ? `<div class="mt-1">${fmt(new Date(r.start).getTime())}</div>`
            : ""}</div>`,
    };
}
function fmt(ms) {
    return new Date(ms).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}
function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
