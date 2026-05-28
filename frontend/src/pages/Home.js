import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useMe } from "../lib/auth";
import FilterBar from "../components/FilterBar";
import ExportMenu from "../components/ExportMenu";
import RecommendationsWidget from "../components/RecommendationsWidget";
import PartnerBadge from "../components/PartnerBadge";
import { downloadCsv } from "../lib/export";
export default function Home() {
    const f = useFilters();
    const q = f.asQuery();
    const { data: me } = useMe();
    const myOrgs = me?.member_organisations ?? [];
    const summary = useQuery({
        queryKey: ["stats-summary", q],
        queryFn: () => api("/api/analytics/stats/summary/", { query: q }),
    });
    const top = useQuery({
        queryKey: ["stats-top-orgs", q],
        queryFn: () => api("/api/analytics/stats/top-orgs/", { query: q }),
    });
    const cats = useQuery({
        queryKey: ["stats-top-cats", q],
        queryFn: () => api("/api/analytics/stats/top-categories/", {
            query: q,
        }),
    });
    const ts = useQuery({
        queryKey: ["stats-ts", q],
        queryFn: () => api("/api/analytics/stats/interactions-timeseries/", {
            query: q,
        }),
    });
    const s = summary.data;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Overview" }), _jsx("p", { className: "text-sm text-muted", children: "High-level signals across Plymouth\u2019s arts & cultural data." })] }), _jsx(FilterBar, {}), myOrgs.length > 0 && (_jsxs("section", { className: "card p-4", children: [_jsxs("div", { className: "mb-2 text-xs uppercase tracking-wide text-muted", children: ["Your organisation", myOrgs.length === 1 ? "" : "s"] }), _jsx("div", { className: "flex flex-wrap gap-2", children: myOrgs.map((o) => (_jsxs(Link, { to: `/organisations/${o.slug}`, className: "inline-flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10", children: [_jsx("span", { className: "font-medium", children: o.name }), o.is_partner && _jsx(PartnerBadge, {})] }, o.id))) })] })), _jsxs("section", { className: "grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6", children: [_jsx(Stat, { label: "Organisations", value: s?.org_count, to: "/organisations" }), _jsx(Stat, { label: "Locations", value: s?.location_count, to: "/map3d" }), _jsx(Stat, { label: "Events", value: s?.event_count, to: "/calendar" }), _jsx(Stat, { label: "Interactions", value: s?.interaction_count, to: "/journeys" }), _jsx(Stat, { label: "Unique visitors", value: s?.unique_visitors, to: "/journeys" }), _jsx(Stat, { label: "Postcode hits", value: s?.postcode_count, to: "/postcodes3d" })] }), _jsxs("section", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("div", { className: "card p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "font-medium", children: "Top organisations" }), _jsx(ExportMenu, { items: [
                                            {
                                                label: "Download CSV",
                                                onClick: () => downloadCsv("top-organisations.csv", top.data?.results ?? [], [
                                                    { key: "organisation__name", label: "Organisation" },
                                                    { key: "organisation__slug", label: "Slug" },
                                                    { key: "n", label: "Interactions" },
                                                ]),
                                                disabled: !top.data?.results.length,
                                            },
                                        ] })] }), _jsx(RankList, { rows: (top.data?.results ?? []).map((r) => ({
                                    label: r.organisation__name,
                                    n: r.n,
                                })) })] }), _jsxs("div", { className: "card p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "font-medium", children: "Top categories" }), _jsx(ExportMenu, { items: [
                                            {
                                                label: "Download CSV",
                                                onClick: () => downloadCsv("top-categories.csv", cats.data?.results ?? [], [
                                                    { key: "name", label: "Category" },
                                                    { key: "slug", label: "Slug" },
                                                    { key: "n", label: "Interactions" },
                                                ]),
                                                disabled: !cats.data?.results.length,
                                            },
                                        ] })] }), _jsx(RankList, { rows: (cats.data?.results ?? []).map((r) => ({
                                    label: r.name,
                                    n: r.n,
                                })) })] })] }), _jsxs("section", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs("div", { className: "lg:col-span-2 card p-4", children: [_jsx("h2", { className: "font-medium mb-3", children: "Interactions over time" }), _jsx(Sparkline, { points: (ts.data?.series ?? []).map((p) => p.count) })] }), _jsx(RecommendationsWidget, {})] }), _jsxs("section", { className: "card p-4", children: [_jsx("h2", { className: "font-medium mb-3", children: "Upcoming events" }), _jsxs("ul", { className: "divide-y divide-border", children: [(s?.upcoming_events ?? []).map((e) => (_jsxs("li", { className: "py-2 flex items-center gap-3", children: [_jsx("div", { className: "text-xs text-muted w-28 tabular-nums", children: new Date(e.start_datetime).toLocaleString() }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "truncate font-medium", children: e.title }), _jsxs("div", { className: "text-xs text-muted truncate", children: [e.organisation__name, e.location__name ? ` · ${e.location__name}` : ""] })] }), e.url && (_jsx("a", { href: e.url, target: "_blank", rel: "noreferrer", className: "btn-ghost text-xs", children: "Open" }))] }, e.id))), !s?.upcoming_events?.length && (_jsx("li", { className: "py-2 text-sm text-muted", children: "No upcoming events." }))] })] })] }));
}
function Stat({ label, value, to, }) {
    const inner = (_jsxs(_Fragment, { children: [_jsx("div", { className: "stat-label", children: label }), _jsx("div", { className: "stat-value", children: value === undefined ? "—" : value.toLocaleString() })] }));
    if (to) {
        return (_jsx(Link, { to: to, className: "stat hover:bg-border/30 transition-colors block", children: inner }));
    }
    return _jsx("div", { className: "stat", children: inner });
}
function RankList({ rows }) {
    if (!rows.length)
        return _jsx("div", { className: "text-sm text-muted", children: "No data." });
    const max = Math.max(...rows.map((r) => r.n));
    return (_jsx("ol", { className: "space-y-1.5", children: rows.map((r) => (_jsxs("li", { className: "text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "truncate", children: r.label }), _jsx("span", { className: "text-muted tabular-nums", children: r.n })] }), _jsx("div", { className: "h-1 bg-border/50 rounded mt-1", children: _jsx("div", { className: "h-1 bg-accent rounded", style: { width: `${(r.n / max) * 100}%` } }) })] }, r.label))) }));
}
function Sparkline({ points }) {
    if (!points.length) {
        return _jsx("div", { className: "text-sm text-muted", children: "No data." });
    }
    const w = 600;
    const h = 80;
    const max = Math.max(...points, 1);
    const step = points.length > 1 ? w / (points.length - 1) : 0;
    const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
        .join(" ");
    return (_jsx("svg", { viewBox: `0 0 ${w} ${h}`, className: "w-full h-20 text-accent", preserveAspectRatio: "none", children: _jsx("path", { d: d, fill: "none", stroke: "currentColor", strokeWidth: 1.5 }) }));
}
