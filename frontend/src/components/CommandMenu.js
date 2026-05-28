import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
const STATIC_PAGES = [
    { type: "page", label: "Overview", to: "/" },
    { type: "page", label: "Search", to: "/search" },
    { type: "page", label: "Map", to: "/map" },
    { type: "page", label: "Calendar", to: "/calendar" },
    { type: "page", label: "Organisations", to: "/organisations" },
];
/**
 * Global Cmd-K command palette.
 *
 * Powered by `/api/search/` — hybrid Postgres FTS + pg_trgm + pgvector
 * cosine similarity over Events and Organisations.
 */
export default function CommandMenu({ open, onClose }) {
    const [q, setQ] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const nav = useNavigate();
    useEffect(() => {
        if (open) {
            setQ("");
            setActive(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);
    const search = useQuery({
        queryKey: ["cmdk-search", q],
        enabled: open && q.length > 1,
        queryFn: () => api("/api/search/", {
            query: { q, limit: 10 },
        }),
    });
    const remoteHits = (search.data?.results ?? []).map((r) => ({
        type: r.type,
        label: r.title,
        sub: r.type === "event"
            ? `${r.organisation?.name ?? ""}${r.start_datetime
                ? ` · ${new Date(r.start_datetime).toLocaleDateString()}`
                : ""}`
            : r.snippet,
        to: r.type === "event"
            ? `/calendar?event=${r.id}`
            : `/organisations?org=${r.id}`,
        score: r.score,
    }));
    const hits = [
        ...STATIC_PAGES.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase())),
        ...remoteHits,
    ];
    if (!open)
        return null;
    const onKey = (e) => {
        if (e.key === "Escape")
            return onClose();
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        }
        else if (e.key === "Enter") {
            const h = hits[active];
            if (h) {
                nav(h.to);
                onClose();
            }
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4", onClick: onClose, children: _jsxs("div", { className: "w-full max-w-xl card overflow-hidden", onClick: (e) => e.stopPropagation(), children: [_jsx("input", { ref: inputRef, value: q, onChange: (e) => {
                        setQ(e.target.value);
                        setActive(0);
                    }, onKeyDown: onKey, placeholder: "Search events, organisations, or jump to a page\u2026", className: "w-full px-4 py-3 bg-transparent border-b border-border outline-none text-sm" }), _jsxs("ul", { className: "max-h-80 overflow-y-auto py-1", children: [hits.length === 0 && (_jsx("li", { className: "px-4 py-3 text-sm text-muted", children: "No results." })), hits.map((h, i) => (_jsxs("li", { onMouseEnter: () => setActive(i), onClick: () => {
                                nav(h.to);
                                onClose();
                            }, className: "px-4 py-2 text-sm cursor-pointer flex items-center gap-3 " +
                                (i === active ? "bg-border/40" : ""), children: [_jsx("span", { className: "text-[10px] uppercase tracking-wider text-muted w-12", children: h.type }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "truncate", children: h.label }), h.sub && (_jsx("div", { className: "text-xs text-muted truncate", children: h.sub }))] })] }, `${h.type}-${h.to}-${i}`)))] }), _jsxs("div", { className: "border-t border-border px-4 py-2 text-[10px] text-muted flex items-center gap-3", children: [_jsx("span", { children: "\u2191\u2193 navigate" }), _jsx("span", { children: "\u21B5 open" }), _jsx("span", { children: "esc close" })] })] }) }));
}
