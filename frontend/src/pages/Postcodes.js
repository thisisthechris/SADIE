import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import Map2D from "../viz/Map2D";
import { downloadCsv } from "../lib/export";
export default function Postcodes() {
    const f = useFilters();
    const cfg = useConfig();
    const key = cfg.data?.maptiler_api_key ?? "";
    const q = f.asQuery();
    const bars = useQuery({
        queryKey: ["viz-postcode-bars", q],
        queryFn: () => api("/api/analytics/viz/postcode-bars/", { query: q }),
    });
    const records = useQuery({
        queryKey: ["viz-postcode-records", q],
        queryFn: () => api("/api/analytics/viz/postcode-records/", {
            query: { ...q, limit: "200" },
        }),
    });
    // Aggregate the district rows for the bar chart + summary table.
    const districts = useMemo(() => {
        const map = new Map();
        for (const b of bars.data?.results ?? []) {
            const k = b.district || b.area || "Unknown";
            const cur = map.get(k);
            if (cur)
                cur.total += b.total;
            else
                map.set(k, { area: k, total: b.total });
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [bars.data]);
    const maxDistrictTotal = districts[0]?.total ?? 1;
    const points = useMemo(() => {
        const max = Math.max(1, ...(bars.data?.results ?? []).map((b) => b.total));
        return (bars.data?.results ?? []).map((b) => ({
            id: `${b.district}-${b.postcode}`,
            lng: b.lng,
            lat: b.lat,
            // Map weight to 0–100 so Map2D's interpolation gives us a wide radius.
            weight: Math.round((b.total / max) * 100),
            color: "#20c997",
            popupHtml: `<div class="text-sm"><div class="font-medium">${escapeHtml(b.district || b.area)}</div><div>${b.total.toLocaleString()} interactions</div><div class="text-xs text-muted">Postcode ${escapeHtml(b.postcode)}</div></div>`,
        }));
    }, [bars.data]);
    const totalInteractions = useMemo(() => (bars.data?.results ?? []).reduce((s, r) => s + r.total, 0), [bars.data]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Postcode Interactions" }), _jsx("p", { className: "text-sm text-muted", children: "Interaction counts aggregated by Plymouth postcode area." })] }), _jsx(FilterBar, {}), _jsx("div", { className: "flex justify-end", children: _jsx(ExportMenu, { items: [
                        {
                            label: "CSV districts",
                            disabled: !districts.length,
                            onClick: () => downloadCsv("postcode-districts.csv", districts, [
                                { key: "area", label: "District" },
                                { key: "total", label: "Total" },
                            ]),
                        },
                        {
                            label: "CSV records",
                            disabled: !records.data?.results.length,
                            onClick: () => downloadCsv("postcode-records.csv", records.data?.results ?? [], [
                                { key: "postcode", label: "Postcode" },
                                { key: "area", label: "Area" },
                                { key: "organisation", label: "Organisation" },
                                { key: "interaction_count", label: "Count" },
                                { key: "period_start", label: "Period start" },
                                { key: "period_end", label: "Period end" },
                            ]),
                        },
                    ] }) }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("div", { className: "card overflow-hidden", children: [_jsx("div", { className: "px-4 py-2 border-b text-sm font-medium", children: "Postcode area map" }), !key ? (_jsxs("div", { className: "p-6 text-sm text-muted", children: ["MapTiler key missing \u2014 set", " ", _jsx("code", { className: "font-mono", children: "MAPTILER_API_KEY" }), " and restart."] })) : (_jsx(Map2D, { points: points, maptilerKey: key, height: "400px", defaultColor: "#20c997" }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "px-4 py-2 border-b text-sm font-medium", children: "Top areas by total interactions" }), _jsx("div", { className: "p-4", children: districts.length === 0 ? (_jsx("div", { className: "text-xs text-muted", children: "No data." })) : (_jsx("ul", { className: "space-y-1.5", children: districts.slice(0, 20).map((d) => {
                                        const pct = (d.total / maxDistrictTotal) * 100;
                                        return (_jsxs("li", { children: [_jsxs("div", { className: "flex items-center justify-between text-xs mb-0.5", children: [_jsx("span", { className: "font-mono", children: d.area }), _jsx("span", { className: "tabular-nums text-muted", children: d.total.toLocaleString() })] }), _jsx("div", { className: "h-2 rounded bg-slate-100 overflow-hidden", children: _jsx("div", { className: "h-full bg-emerald-500", style: { width: `${pct}%` } }) })] }, d.area));
                                    }) })) })] })] }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs("div", { className: "card lg:col-span-1", children: [_jsx("div", { className: "px-4 py-2 border-b text-sm font-medium", children: "Area summary" }), _jsx("div", { className: "max-h-96 overflow-y-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-xs uppercase text-muted sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-3 py-2 w-8", children: "#" }), _jsx("th", { className: "text-left px-3 py-2", children: "Area" }), _jsx("th", { className: "text-right px-3 py-2", children: "Total" })] }) }), _jsx("tbody", { children: districts.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "text-center text-muted py-6", children: "No data yet." }) })) : (districts.map((d, i) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "px-3 py-1.5 text-muted", children: i + 1 }), _jsx("td", { className: "px-3 py-1.5 font-mono", children: d.area }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: d.total.toLocaleString() })] }, d.area)))) })] }) })] }), _jsxs("div", { className: "card lg:col-span-2", children: [_jsxs("div", { className: "px-4 py-2 border-b text-sm font-medium flex items-center justify-between", children: [_jsx("span", { children: "Postcode records" }), _jsxs("span", { className: "text-xs text-muted", children: ["Top ", records.data?.results.length ?? 0, " by count"] })] }), _jsx("div", { className: "max-h-96 overflow-y-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-xs uppercase text-muted sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-3 py-2", children: "Postcode" }), _jsx("th", { className: "text-left px-3 py-2", children: "Area" }), _jsx("th", { className: "text-left px-3 py-2", children: "Organisation" }), _jsx("th", { className: "text-right px-3 py-2", children: "Count" }), _jsx("th", { className: "text-left px-3 py-2 whitespace-nowrap", children: "Period" })] }) }), _jsx("tbody", { children: !records.data?.results.length ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "text-center text-muted py-6", children: "No postcode data yet." }) })) : (records.data.results.map((r) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "px-3 py-1.5", children: _jsx("code", { className: "font-mono", children: r.postcode }) }), _jsx("td", { className: "px-3 py-1.5", children: r.area || "–" }), _jsx("td", { className: "px-3 py-1.5", children: r.organisation }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: r.interaction_count.toLocaleString() }), _jsxs("td", { className: "px-3 py-1.5 text-xs text-muted whitespace-nowrap", children: [fmtDate(r.period_start), " \u2013 ", fmtDate(r.period_end)] })] }, r.id)))) })] }) })] })] }), _jsx("div", { className: "text-xs text-muted", children: bars.isLoading || records.isLoading
                    ? "Loading…"
                    : `${districts.length} districts · ${totalInteractions.toLocaleString()} total interactions` })] }));
}
function fmtDate(iso) {
    if (!iso)
        return "–";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return iso;
    return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
