import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, } from "react-router-dom";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";
import CommandMenu from "./CommandMenu";
import { useQueryClient } from "@tanstack/react-query";
const NAV = [
    { to: "/", label: "Overview", end: true },
    { to: "/search", label: "Search" },
    {
        label: "Maps",
        items: [
            { to: "/map", label: "Map" },
            { to: "/map3d", label: "3D Map" },
            { to: "/postcodes", label: "Postcodes" },
            { to: "/postcodes3d", label: "Postcodes 3D" },
        ],
    },
    {
        label: "Insights",
        items: [
            { to: "/network", label: "Network" },
            { to: "/timecube", label: "Time Cube" },
            { to: "/journeys", label: "Journeys" },
        ],
    },
    { to: "/calendar", label: "Calendar" },
    {
        label: "Directory",
        items: [
            { to: "/organisations", label: "Organisations" },
            { to: "/views", label: "Saved views" },
            { to: "/imports", label: "Imports", staff: true },
        ],
    },
];
function isGroup(e) {
    return e.items !== undefined;
}
// Flat map of pathname → human title (used for the page-title display).
const TITLES = (() => {
    const out = {};
    for (const e of NAV) {
        if (isGroup(e)) {
            for (const i of e.items)
                out[i.to] = i.label;
        }
        else {
            out[e.to] = e.label;
        }
    }
    out["/v"] = "Saved view";
    return out;
})();
function pageTitleFor(pathname) {
    if (TITLES[pathname])
        return TITLES[pathname];
    // Match longest known prefix (e.g. /v/:slug → "Saved view").
    const segs = pathname.split("/").filter(Boolean);
    while (segs.length) {
        const candidate = "/" + segs.join("/");
        if (TITLES[candidate])
            return TITLES[candidate];
        segs.pop();
    }
    return "";
}
export default function Layout() {
    const { data: me } = useMe();
    const qc = useQueryClient();
    const nav = useNavigate();
    const location = useLocation();
    const [cmdOpen, setCmdOpen] = useState(false);
    const [dark, setDark] = useState(() => typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark"));
    // Cmd-K / Ctrl-K opens the global command menu.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setCmdOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    const toggleDark = () => {
        document.documentElement.classList.toggle("dark");
        setDark((v) => !v);
    };
    const handleLogout = async () => {
        await api("/api/auth/logout/", { method: "POST" });
        qc.removeQueries({ queryKey: ["me"] });
        nav("/login");
    };
    const isStaff = !!me?.is_staff;
    const visibleNav = NAV.filter((e) => !e.staff || isStaff).map((e) => {
        if (isGroup(e)) {
            return { ...e, items: e.items.filter((i) => !i.staff || isStaff) };
        }
        return e;
    });
    const myOrgs = me?.member_organisations ?? [];
    if (myOrgs.length > 0) {
        visibleNav.push({
            label: myOrgs.length === 1 ? "My organisation" : "My organisations",
            items: myOrgs.map((o) => ({
                to: `/organisations/${o.slug}`,
                label: o.name,
            })),
        });
    }
    const pageTitle = pageTitleFor(location.pathname);
    return (_jsxs("div", { className: "min-h-screen flex flex-col", children: [_jsx("header", { className: "sticky top-0 z-30 backdrop-blur bg-bg/85 border-b border-border", children: _jsxs("div", { className: "mx-auto max-w-7xl px-4 h-14 flex items-center gap-4", children: [_jsx(MainMenu, { nav: visibleNav }), pageTitle && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted/60 hidden sm:inline", "aria-hidden": true, children: "/" }), _jsx("h1", { className: "text-sm font-medium truncate", children: pageTitle })] })), _jsxs("div", { className: "ml-auto flex items-center gap-2", children: [_jsxs("button", { onClick: () => setCmdOpen(true), className: "btn-ghost text-muted text-xs", title: "Search (\u2318K)", children: [_jsx("span", { children: "Search" }), _jsx("kbd", { className: "px-1.5 py-0.5 rounded border border-border bg-card text-[10px]", children: "\u2318K" })] }), _jsx("button", { onClick: toggleDark, className: "btn-ghost", "aria-label": "Toggle theme", children: dark ? "☼" : "☾" }), me && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-xs text-muted hidden sm:inline", children: me.username }), _jsx("button", { onClick: handleLogout, className: "btn-ghost text-xs", children: "Sign out" })] }))] })] }) }), _jsx("main", { className: "flex-1 mx-auto max-w-7xl w-full px-4 py-6", children: _jsx(Outlet, {}) }), _jsx("footer", { className: "border-t border-border text-xs text-muted py-3 text-center", children: "SADIE \u00B7 Plymouth arts & cultural analytics" }), _jsx(CommandMenu, { open: cmdOpen, onClose: () => setCmdOpen(false) })] }));
}
function MainMenu({ nav }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const location = useLocation();
    useEffect(() => {
        if (!open)
            return;
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === "Escape")
                setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);
    useEffect(() => {
        setOpen(false);
    }, [location.pathname]);
    // Split entries: leaves (top of panel) and groups (sections below).
    const leaves = nav.filter((e) => !isGroup(e));
    const groups = nav.filter(isGroup);
    return (_jsxs("div", { className: "relative", ref: ref, children: [_jsxs("button", { type: "button", onClick: () => setOpen((v) => !v), "aria-haspopup": "menu", "aria-expanded": open, "aria-label": "Open navigation menu", className: "font-semibold tracking-tight text-lg shrink-0 inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-border/40", children: [_jsxs("span", { children: ["SADIE", _jsx("span", { className: "text-accent", children: "." })] }), _jsx("svg", { width: "10", height: "10", viewBox: "0 0 10 10", "aria-hidden": true, className: "text-muted transition-transform " + (open ? "rotate-180" : ""), children: _jsx("path", { d: "M2 4l3 3 3-3", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) })] }), open && (_jsxs("div", { role: "menu", className: "absolute left-0 mt-1 min-w-[240px] rounded-md border border-border bg-bg shadow-lg py-1 z-40", children: [leaves.map((item) => (_jsx(NavLink, { to: item.to, end: item.end, role: "menuitem", className: ({ isActive }) => "block px-3 py-1.5 text-sm hover:bg-border/40 " +
                            (isActive ? "text-fg font-medium bg-border/30" : "text-fg"), children: item.label }, item.to))), groups.map((group, gi) => (_jsxs("div", { children: [(leaves.length > 0 || gi > 0) && (_jsx("div", { className: "my-1 border-t border-border" })), _jsx("div", { className: "px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted", children: group.label }), group.items.map((item) => (_jsx(NavLink, { to: item.to, role: "menuitem", className: ({ isActive }) => "block px-3 py-1.5 text-sm hover:bg-border/40 " +
                                    (isActive ? "text-fg font-medium bg-border/30" : "text-fg"), children: item.label }, item.to)))] }, group.label)))] }))] }));
}
