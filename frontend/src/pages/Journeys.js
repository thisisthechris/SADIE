import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import { downloadCsv } from "../lib/export";
export default function Journeys() {
    const f = useFilters();
    const q = f.asQuery();
    const journeys = useQuery({
        queryKey: ["journeys-summary", q],
        queryFn: () => api("/api/analytics/journeys/summary/", { query: q }),
    });
    const data = journeys.data;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "User Journeys" }), _jsx("p", { className: "text-sm text-muted", children: "Anonymised interaction analytics across organisations and time." })] }), _jsx(FilterBar, {}), _jsxs("section", { className: "grid gap-3 grid-cols-2 md:grid-cols-4", children: [_jsx(Stat, { label: "Interactions", value: data?.totals.interactions }), _jsx(Stat, { label: "Unique visitors", value: data?.totals.unique_users }), _jsx(Stat, { label: "Event interactions", value: data?.type_breakdown.find((r) => r.interaction_type === "event")?.n }), _jsx(Stat, { label: "Location interactions", value: data?.type_breakdown.find((r) => r.interaction_type === "location")
                            ?.n })] }), _jsxs("section", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs("div", { className: "card p-4 lg:col-span-2", children: [_jsx("h2", { className: "font-medium mb-3", children: "Monthly trend" }), _jsx(Sparkline, { points: (data?.monthly ?? []).map((p) => p.count) })] }), _jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsx("h2", { className: "font-medium", children: "Type breakdown" }) }), _jsx(Doughnut, { rows: data?.type_breakdown ?? [] })] })] }), _jsxs("section", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("div", { className: "card p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "font-medium", children: "Unique visitors per organisation" }), _jsx(ExportMenu, { items: [
                                            {
                                                label: "Download CSV",
                                                disabled: !data?.unique_users_by_org.length,
                                                onClick: () => downloadCsv("journeys-unique-by-org.csv", data?.unique_users_by_org ?? [], [
                                                    { key: "organisation", label: "Organisation" },
                                                    { key: "unique_users", label: "Unique users" },
                                                ]),
                                            },
                                        ] })] }), _jsx(RankList, { rows: (data?.unique_users_by_org ?? []).map((r) => ({
                                    label: r.organisation,
                                    n: r.unique_users,
                                })) })] }), _jsxs("div", { className: "card p-4", children: [_jsxs("h2", { className: "font-medium mb-3", children: ["Top visitors", " ", _jsx("span", { className: "text-xs text-muted font-normal", children: "(anonymised hashes)" })] }), _jsx(RankList, { rows: (data?.top_users ?? []).map((r) => ({
                                    label: r.user_hash || "—",
                                    n: r.n,
                                })) })] })] }), _jsxs("section", { className: "card p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "font-medium", children: "Organisation \u00D7 type" }), _jsx(ExportMenu, { items: [
                                    {
                                        label: "Download CSV",
                                        disabled: !data?.cross_tab.length,
                                        onClick: () => downloadCsv("journeys-cross-tab.csv", data?.cross_tab ?? [], [
                                            { key: "organisation", label: "Organisation" },
                                            { key: "interaction_type", label: "Type" },
                                            { key: "count", label: "Count" },
                                        ]),
                                    },
                                ] })] }), data?.cross_tab.length ? (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs uppercase text-muted", children: [_jsx("th", { className: "py-1", children: "Organisation" }), _jsx("th", { className: "py-1", children: "Type" }), _jsx("th", { className: "py-1 text-right", children: "Count" })] }) }), _jsx("tbody", { className: "divide-y divide-border", children: data.cross_tab.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { className: "py-1.5", children: r.organisation }), _jsx("td", { className: "py-1.5 text-muted", children: r.interaction_type }), _jsx("td", { className: "py-1.5 text-right tabular-nums", children: r.count })] }, `${r.organisation}-${r.interaction_type}-${i}`))) })] })) : (_jsx("div", { className: "text-sm text-muted", children: "No data." }))] })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "stat", children: [_jsx("div", { className: "stat-label", children: label }), _jsx("div", { className: "stat-value", children: value === undefined ? "—" : value.toLocaleString() })] }));
}
function RankList({ rows }) {
    if (!rows.length)
        return _jsx("div", { className: "text-sm text-muted", children: "No data." });
    const max = Math.max(...rows.map((r) => r.n), 1);
    return (_jsx("ol", { className: "space-y-1.5", children: rows.map((r, i) => (_jsxs("li", { className: "text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "truncate font-mono text-xs", children: r.label }), _jsx("span", { className: "text-muted tabular-nums", children: r.n })] }), _jsx("div", { className: "h-1 bg-border/50 rounded mt-1", children: _jsx("div", { className: "h-1 bg-accent rounded", style: { width: `${(r.n / max) * 100}%` } }) })] }, `${r.label}-${i}`))) }));
}
function Sparkline({ points }) {
    if (!points.length)
        return _jsx("div", { className: "text-sm text-muted", children: "No data." });
    const w = 600;
    const h = 80;
    const max = Math.max(...points, 1);
    const step = points.length > 1 ? w / (points.length - 1) : 0;
    const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
        .join(" ");
    return (_jsx("svg", { viewBox: `0 0 ${w} ${h}`, className: "w-full h-20 text-accent", preserveAspectRatio: "none", children: _jsx("path", { d: d, fill: "none", stroke: "currentColor", strokeWidth: 1.5 }) }));
}
const SLICE_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa"];
function Doughnut({ rows, }) {
    const total = rows.reduce((acc, r) => acc + r.n, 0);
    if (!total)
        return _jsx("div", { className: "text-sm text-muted", children: "No data." });
    const cx = 60;
    const cy = 60;
    const r = 50;
    const inner = 28;
    let angle = -Math.PI / 2;
    const slices = rows.map((row, i) => {
        const frac = row.n / total;
        const a0 = angle;
        const a1 = angle + frac * Math.PI * 2;
        angle = a1;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const xi1 = cx + inner * Math.cos(a1);
        const yi1 = cy + inner * Math.sin(a1);
        const xi0 = cx + inner * Math.cos(a0);
        const yi0 = cy + inner * Math.sin(a0);
        const d = [
            `M ${x0} ${y0}`,
            `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
            `L ${xi1} ${yi1}`,
            `A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0}`,
            "Z",
        ].join(" ");
        return { d, color: SLICE_COLORS[i % SLICE_COLORS.length], row, frac };
    });
    return (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("svg", { viewBox: "0 0 120 120", className: "w-32 h-32 shrink-0", children: slices.map((s) => (_jsx("path", { d: s.d, fill: s.color }, s.row.interaction_type))) }), _jsx("ul", { className: "text-sm space-y-1", children: slices.map((s) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "inline-block w-2.5 h-2.5 rounded-sm", style: { background: s.color } }), _jsx("span", { className: "capitalize", children: s.row.interaction_type }), _jsxs("span", { className: "text-muted tabular-nums", children: [s.row.n.toLocaleString(), " (", Math.round(s.frac * 100), "%)"] })] }, s.row.interaction_type))) })] }));
}
