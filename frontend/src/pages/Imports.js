import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
const STATUSES = [
    "pending",
    "auto_matched",
    "approved",
    "rejected",
    "imported",
];
const STATUS_LABEL = {
    pending: "Pending",
    auto_matched: "Auto-matched",
    approved: "Approved",
    rejected: "Rejected",
    imported: "Imported",
};
export default function Imports() {
    const qc = useQueryClient();
    const counts = useQuery({
        queryKey: ["imports-counts"],
        queryFn: () => api("/api/imports/counts/"),
    });
    const all = useQuery({
        queryKey: ["imports-list"],
        queryFn: () => api("/api/imports/", {
            query: { page_size: 200, ordering: "-created_at" },
        }),
    });
    const [selected, setSelected] = useState(new Set());
    const [drawerId, setDrawerId] = useState(null);
    const grouped = useMemo(() => {
        const out = {
            pending: [],
            auto_matched: [],
            approved: [],
            rejected: [],
            imported: [],
        };
        (all.data?.results ?? []).forEach((e) => {
            out[e.status]?.push(e);
        });
        return out;
    }, [all.data]);
    const bulk = useMutation({
        mutationFn: (action) => api("/api/imports/bulk-action/", { method: "POST", body: { ids: Array.from(selected), action } }),
        onSuccess: () => {
            setSelected(new Set());
            qc.invalidateQueries({ queryKey: ["imports-list"] });
            qc.invalidateQueries({ queryKey: ["imports-counts"] });
        },
    });
    const toggleSel = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-end justify-between flex-wrap gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Import review queue" }), _jsxs("p", { className: "text-sm text-muted", children: ["Triage scraped events. Approve to mark for import, then run \"Import\" to write them into the live ", _jsx("code", { children: "events" }), " table."] })] }), selected.size > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-xs text-muted", children: [selected.size, " selected"] }), _jsx("button", { className: "btn-ghost text-xs", disabled: bulk.isPending, onClick: () => bulk.mutate("approve"), children: "Approve" }), _jsx("button", { className: "btn-ghost text-xs text-red-400", disabled: bulk.isPending, onClick: () => bulk.mutate("reject"), children: "Reject" }), _jsx("button", { className: "btn text-xs", disabled: bulk.isPending, onClick: () => bulk.mutate("import"), children: "Import to events" }), _jsx("button", { className: "btn-ghost text-xs", disabled: bulk.isPending, onClick: () => bulk.mutate("reset"), children: "Reset" })] }))] }), bulk.data?.errors?.length ? (_jsxs("div", { className: "card p-3 text-xs text-amber-300", children: ["Some rows failed:", " ", bulk.data.errors.map((e, i) => (_jsxs("span", { children: ["#", e.id, ": ", e.reason, ";", " "] }, i)))] })) : null, _jsx("div", { className: "grid gap-3 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2", children: STATUSES.map((s) => (_jsx(Column, { label: STATUS_LABEL[s], count: counts.data?.[s] ?? grouped[s].length, rows: grouped[s], selected: selected, onToggle: toggleSel, onOpen: setDrawerId }, s))) }), drawerId && _jsx(Drawer, { id: drawerId, onClose: () => setDrawerId(null) })] }));
}
function Column({ label, count, rows, selected, onToggle, onOpen, }) {
    return (_jsxs("div", { className: "card p-3 flex flex-col gap-2 min-h-[300px]", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "font-medium text-sm", children: label }), _jsx("span", { className: "text-[10px] text-muted", children: count })] }), _jsxs("ul", { className: "flex-1 space-y-2 overflow-y-auto max-h-[70vh]", children: [rows.map((e) => (_jsxs("li", { className: "rounded border p-2 text-xs space-y-1 cursor-pointer hover:bg-border/30 " +
                            (selected.has(e.id) ? "border-accent" : "border-border"), onClick: () => onOpen(e.id), children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("input", { type: "checkbox", checked: selected.has(e.id), onChange: () => onToggle(e.id), onClick: (ev) => ev.stopPropagation() }), _jsx("div", { className: "font-medium leading-snug truncate flex-1", children: e.title })] }), _jsxs("div", { className: "text-muted truncate", children: [e.source_name, e.venue_name ? ` · ${e.venue_name}` : ""] }), e.start_datetime && (_jsx("div", { className: "text-muted tabular-nums", children: new Date(e.start_datetime).toLocaleString() })), e.matched_organisation_name && (_jsxs("div", { className: "text-accent truncate", children: ["\u2192 ", e.matched_organisation_name] }))] }, e.id))), !rows.length && _jsx("li", { className: "text-xs text-muted py-3 text-center", children: "Empty" })] })] }));
}
function Drawer({ id, onClose }) {
    const q = useQuery({
        queryKey: ["import-detail", id],
        queryFn: () => api(`/api/imports/${id}/`),
    });
    return (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40", onClick: onClose, children: _jsxs("aside", { className: "absolute right-0 top-0 h-full w-[min(560px,90vw)] bg-card border-l border-border overflow-y-auto p-5 space-y-3", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("h3", { className: "font-medium", children: ["Imported event #", id] }), _jsx("button", { onClick: onClose, className: "btn-ghost text-xs", children: "Close" })] }), q.isLoading && _jsx("p", { className: "text-sm text-muted", children: "Loading\u2026" }), q.data && (_jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium", children: q.data.title }), _jsxs("div", { className: "text-xs text-muted", children: [q.data.source_name, " \u00B7 ", q.data.external_id] })] }), q.data.start_datetime && (_jsxs("div", { className: "text-xs text-muted", children: [new Date(q.data.start_datetime).toLocaleString(), " \u2192", " ", q.data.end_datetime
                                    ? new Date(q.data.end_datetime).toLocaleString()
                                    : "—"] })), q.data.description && (_jsx("p", { className: "text-xs whitespace-pre-wrap", children: q.data.description })), q.data.source_url && (_jsx("a", { href: q.data.source_url, target: "_blank", rel: "noreferrer", className: "text-xs text-accent underline break-all", children: q.data.source_url })), q.data.matched_event && (_jsxs("div", { className: "card p-2 text-xs", children: [_jsx("div", { className: "text-muted", children: "Matched event" }), _jsx("div", { className: "font-medium", children: q.data.matched_event.title })] })), _jsxs("details", { children: [_jsx("summary", { className: "text-xs text-muted cursor-pointer", children: "Raw payload" }), _jsx("pre", { className: "text-[10px] whitespace-pre-wrap bg-bg/50 p-2 rounded mt-1 max-h-72 overflow-auto", children: JSON.stringify(q.data.raw_data, null, 2) })] })] }))] }) }));
}
