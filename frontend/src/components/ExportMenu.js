import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
/**
 * Tiny dropdown menu of export actions (CSV/PNG/etc).
 */
export default function ExportMenu({ items, label = "Export" }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "relative inline-block", children: [_jsxs("button", { type: "button", onClick: () => setOpen((v) => !v), className: "btn-ghost text-xs", children: [label, " \u25BE"] }), open && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-30", onClick: () => setOpen(false) }), _jsx("div", { className: "absolute right-0 z-40 mt-1 min-w-[140px] rounded-md border border-border bg-card shadow-lg py-1", children: items.map((it, i) => (_jsx("button", { type: "button", disabled: it.disabled, onClick: () => {
                                setOpen(false);
                                it.onClick();
                            }, className: "block w-full text-left px-3 py-1.5 text-xs hover:bg-border/40 disabled:opacity-50", children: it.label }, i))) })] }))] }));
}
