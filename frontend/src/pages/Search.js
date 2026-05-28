import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
const FILTER_LABELS = {
    all: "All",
    event: "Events",
    organisation: "Organisations",
};
/**
 * Hybrid search page powered by /api/search/.
 *
 * Combines Postgres FTS, pg_trgm fuzzy matching, and pgvector cosine
 * similarity over local fastembed embeddings.
 */
export default function Search() {
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const search = useQuery({
        queryKey: ["search", q],
        enabled: q.trim().length > 1,
        queryFn: () => api("/api/search/", {
            query: { q: q.trim(), limit: 50 },
        }),
    });
    const all = search.data?.results ?? [];
    const results = filter === "all" ? all : all.filter((r) => r.type === filter);
    const counts = {
        all: all.length,
        event: all.filter((r) => r.type === "event").length,
        organisation: all.filter((r) => r.type === "organisation").length,
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Search" }), _jsxs("p", { className: "text-sm text-muted", children: ["Hybrid keyword + semantic search across events and organisations.", search.data?.vector === false && (_jsx("span", { className: "ml-1 text-amber-500", children: "(vector index unavailable \u2014 keyword only)" }))] })] }), _jsxs("div", { className: "card p-3 space-y-3", children: [_jsx("input", { autoFocus: true, value: q, onChange: (e) => setQ(e.target.value), placeholder: "Try: outdoor family friendly, evening jazz, free workshops\u2026", className: "w-full px-3 py-2 bg-transparent border border-border rounded outline-none text-sm focus:ring-1 focus:ring-accent" }), _jsx("div", { className: "flex items-center gap-2 text-xs", children: Object.keys(FILTER_LABELS).map((k) => (_jsxs("button", { onClick: () => setFilter(k), className: "px-2 py-1 rounded border " +
                                (filter === k
                                    ? "bg-accent text-white border-accent"
                                    : "border-border hover:bg-border/40"), children: [FILTER_LABELS[k], " ", _jsx("span", { className: "opacity-60", children: q.length > 1 ? counts[k] : "" })] }, k))) })] }), q.trim().length <= 1 && (_jsx("div", { className: "card p-6 text-sm text-muted text-center", children: "Start typing to search. Results blend full-text rank, fuzzy (trigram) similarity and semantic vector similarity." })), search.isLoading && q.trim().length > 1 && (_jsx("div", { className: "card p-4 text-sm text-muted", children: "Searching\u2026" })), search.data && results.length === 0 && q.trim().length > 1 && (_jsx("div", { className: "card p-4 text-sm text-muted", children: "No matches." })), _jsx("div", { className: "card divide-y divide-border", children: results.map((r) => (_jsx(SearchRow, { hit: r }, `${r.type}-${r.id}`))) })] }));
}
function SearchRow({ hit }) {
    const to = hit.type === "event"
        ? `/calendar?event=${hit.id}`
        : `/organisations?org=${hit.id}`;
    return (_jsx(Link, { to: to, className: "block p-4 hover:bg-border/30 transition", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsxs("div", { className: "flex flex-col items-center w-14 flex-shrink-0", children: [_jsx("span", { className: "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded " +
                                (hit.type === "event"
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-emerald-500/15 text-emerald-400"), children: hit.type }), _jsx("span", { className: "mt-1 text-[10px] text-muted tabular-nums", title: `Hybrid score: ${hit.score.toFixed(3)}`, children: hit.score.toFixed(2) })] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "font-medium truncate", children: hit.title }), _jsxs("div", { className: "text-xs text-muted truncate", children: [hit.type === "event" && hit.organisation?.name, hit.type === "event" && hit.location?.name && (_jsxs(_Fragment, { children: [" \u00B7 ", hit.location.name] })), hit.type === "event" && hit.start_datetime && (_jsxs(_Fragment, { children: [" \u00B7 ", new Date(hit.start_datetime).toLocaleDateString()] }))] }), hit.snippet && (_jsx("p", { className: "text-sm text-muted line-clamp-2 mt-1", children: hit.snippet }))] })] }) }));
}
