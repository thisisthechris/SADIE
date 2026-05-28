import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters";
import { useCreateSavedView } from "../lib/savedViews";
/**
 * "Save view" — captures the current SPA path + filter querystring and saves
 * it as a named SavedView. Public views also expose a short link `/v/<slug>/`.
 */
export default function SaveViewButton() {
    const f = useFilters();
    const loc = useLocation();
    const m = useCreateSavedView();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [error, setError] = useState(null);
    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        const params = new URLSearchParams();
        Object.entries(f.asQuery()).forEach(([k, v]) => {
            if (v !== "" && v != null)
                params.set(k, String(v));
        });
        try {
            await m.mutateAsync({
                name: name.trim() || `View ${new Date().toLocaleString()}`,
                path: loc.pathname,
                query_string: params.toString(),
                is_public: isPublic,
            });
            setOpen(false);
            setName("");
            setIsPublic(false);
        }
        catch (err) {
            setError(err?.message || "Failed to save view");
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => setOpen(true), className: "btn-ghost text-xs", title: "Save the current page + filters as a named view", children: "\u2605 Save view" }), open && (_jsx("div", { className: "fixed inset-0 z-40 bg-black/50 flex items-center justify-center", onClick: () => setOpen(false), children: _jsxs("form", { onClick: (e) => e.stopPropagation(), onSubmit: submit, className: "card p-5 w-[min(420px,90vw)] space-y-3", children: [_jsx("h3", { className: "font-medium", children: "Save current view" }), _jsxs("p", { className: "text-xs text-muted", children: ["Captures ", _jsx("code", { children: loc.pathname }), " with the active filters."] }), _jsxs("label", { className: "flex flex-col gap-1 text-sm", children: [_jsx("span", { className: "text-[10px] uppercase tracking-wide text-muted", children: "Name" }), _jsx("input", { autoFocus: true, value: name, onChange: (e) => setName(e.target.value), className: "input", placeholder: "e.g. Plymouth gigs this month" })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: isPublic, onChange: (e) => setIsPublic(e.target.checked) }), _jsx("span", { children: "Make public (shareable short link)" })] }), error && _jsx("p", { className: "text-xs text-red-400", children: error }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: () => setOpen(false), className: "btn-ghost text-xs", children: "Cancel" }), _jsx("button", { type: "submit", disabled: m.isPending, className: "btn text-xs", children: m.isPending ? "Saving…" : "Save" })] })] }) }))] }));
}
