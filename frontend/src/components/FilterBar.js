import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import SaveViewButton from "./SaveViewButton";
const PERIODS = [
    { v: "", l: "All time" },
    { v: "7d", l: "Last 7 days" },
    { v: "30d", l: "Last 30 days" },
    { v: "90d", l: "Last 90 days" },
    { v: "1y", l: "Last year" },
];
/**
 * Shared filter bar — mirrors the dashboard `_filter_ctx` template helper so
 * the SPA pages can drive the same `analytics.queries` filtering as the legacy
 * Django pages.
 */
export default function FilterBar() {
    const f = useFilters();
    const orgs = useQuery({
        queryKey: ["filter-orgs"],
        queryFn: () => api("/api/organisations/", {
            query: { page_size: 200, ordering: "name" },
        }),
        staleTime: 5 * 60_000,
    });
    const cats = useQuery({
        queryKey: ["filter-cats"],
        queryFn: () => api("/api/events/categories/", {
            query: { page_size: 200, ordering: "name" },
        }),
        staleTime: 5 * 60_000,
    });
    return (_jsxs("div", { className: "card p-3 flex flex-wrap items-end gap-2 text-sm", children: [_jsx(Field, { label: "Search", children: _jsx("input", { className: "input", value: f.search, onChange: (e) => f.set({ search: e.target.value }), placeholder: "Title or description\u2026" }) }), _jsx(Field, { label: "Organisation", children: _jsxs("select", { className: "input", value: f.org, onChange: (e) => f.set({ org: e.target.value }), children: [_jsx("option", { value: "", children: "All" }), orgs.data?.results.map((o) => (_jsx("option", { value: o.id, children: o.name }, o.id)))] }) }), _jsx(Field, { label: "Category", children: _jsxs("select", { className: "input", value: f.category, onChange: (e) => f.set({ category: e.target.value }), children: [_jsx("option", { value: "", children: "All" }), cats.data?.results.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] }) }), _jsx(Field, { label: "Period", children: _jsx("select", { className: "input", value: f.period, onChange: (e) => f.set({ period: e.target.value, date_from: "" }), children: PERIODS.map((p) => (_jsx("option", { value: p.v, children: p.l }, p.v))) }) }), _jsx(Field, { label: "From", children: _jsx("input", { type: "date", className: "input", value: f.date_from, onChange: (e) => f.set({ date_from: e.target.value, period: "" }) }) }), _jsx(Field, { label: "To", children: _jsx("input", { type: "date", className: "input", value: f.date_to, onChange: (e) => f.set({ date_to: e.target.value }) }) }), _jsx(Field, { label: "Type", children: _jsxs("select", { className: "input", value: f.itype, onChange: (e) => f.set({ itype: e.target.value }), children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "event", children: "Events" }), _jsx("option", { value: "location", children: "Locations" })] }) }), _jsx("button", { onClick: f.reset, className: "btn-ghost text-xs", children: "Reset" }), _jsx(SaveViewButton, {})] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "flex flex-col gap-1 min-w-[140px] flex-1", children: [_jsx("span", { className: "text-[10px] uppercase tracking-wide text-muted", children: label }), children] }));
}
