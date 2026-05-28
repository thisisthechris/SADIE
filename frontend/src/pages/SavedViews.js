import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useAllSavedViews, useDeleteSavedView, useMySavedViews } from "../lib/savedViews";
export default function SavedViews() {
    const mine = useMySavedViews();
    const all = useAllSavedViews();
    const del = useDeleteSavedView();
    const mineRows = mine.data?.results ?? [];
    const publicRows = (all.data?.results ?? []).filter((v) => v.is_public && !mineRows.some((m) => m.id === v.id));
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Saved views" }), _jsx("p", { className: "text-sm text-muted", children: "Bookmarked SPA pages with their filter state. Public views get a short shareable link." })] }), _jsx(Section, { title: "My views", rows: mineRows, onDelete: (slug) => del.mutate(slug), canDelete: true }), _jsx(Section, { title: "Public views", rows: publicRows })] }));
}
function Section({ title, rows, onDelete, canDelete = false, }) {
    return (_jsxs("section", { className: "card p-4", children: [_jsx("h2", { className: "font-medium mb-3", children: title }), !rows?.length ? (_jsx("p", { className: "text-sm text-muted", children: "None yet." })) : (_jsx("ul", { className: "divide-y divide-border", children: rows.map((v) => (_jsxs("li", { className: "py-2 flex items-center gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx(Link, { to: `/v/${v.slug}`, className: "font-medium truncate hover:underline block", children: v.name }), _jsxs("div", { className: "text-xs text-muted truncate", children: [v.path, v.query_string ? `?${v.query_string}` : "", v.is_public && _jsx("span", { className: "ml-2 text-accent", children: "\u00B7 public" })] })] }), v.is_public && (_jsx("button", { type: "button", className: "btn-ghost text-xs", onClick: () => navigator.clipboard.writeText(`${window.location.origin}${v.short_url}`), title: "Copy short link", children: "Copy link" })), _jsx(Link, { to: `/v/${v.slug}`, className: "btn-ghost text-xs", children: "Open" }), canDelete && onDelete && (_jsx("button", { type: "button", className: "btn-ghost text-xs text-red-400", onClick: () => {
                                if (confirm(`Delete "${v.name}"?`))
                                    onDelete(v.slug);
                            }, children: "Delete" }))] }, v.id))) }))] }));
}
