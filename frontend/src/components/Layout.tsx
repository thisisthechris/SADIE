import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "../lib/auth";
import { api } from "../lib/api";
import SearchModal from "./SearchModal";
import Logo from "./Logo";
import BrandShape from "./BrandShape";

type NavLeaf = { to: string; label: string; end?: boolean; staff?: boolean };
type NavGroup = { label: string; items: NavLeaf[]; staff?: boolean };
type NavEntry = NavLeaf | NavGroup;

const NAV: NavEntry[] = [
  { to: "/insights", label: "Insights", end: true },
  {
    label: "Maps",
    items: [
      { to: "/insights/map/venues", label: "Venues" },
      { to: "/insights/map/events", label: "Events" },
    ],
  },
  {
    label: "Exploration",
    items: [
      { to: "/insights/journey-map", label: "Journey Map" },
      { to: "/insights/postcode-areas/map", label: "Postcode Pathways" },
      { to: "/insights/org-connections", label: "Org Connections" },
      { to: "/insights/trends", label: "Trends" },
    ],
  },
  {
    label: "Directory",
    items: [
      { to: "/insights/calendar", label: "Calendar" },
      { to: "/insights/help", label: "Help" },
    ],
  },
  {
    label: "Internal",
    items: [
      { to: "/insights/journeys", label: "Visitor Activity", staff: true },
      { to: "/insights/organisations", label: "Organisations", staff: true },
      { to: "/insights/postcodes", label: "Postcodes (legacy)", staff: true },
      { to: "/insights/postcode-areas", label: "Postcode Overview", end: true, staff: true },
      { to: "/insights/overview", label: "System Overview", staff: true },
      { to: "/insights/imports", label: "Imports", staff: true },
    ],
    staff: true,
  },
];

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).items !== undefined;
}

// Map of pathname → breadcrumb path (e.g., "/insights/map/venues" → ["Maps", "Venues"])
const BREADCRUMBS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const e of NAV) {
    if (isGroup(e)) {
      for (const i of e.items) out[i.to] = [e.label, i.label];
    } else {
      out[e.to] = [e.label];
    }
  }
  out["/insights/v"] = ["Saved view"];
  out["/insights/map/venues"] = ["Maps", "Venues"];
  out["/insights/map/events"] = ["Maps", "Events"];
  out["/insights/postcodes"] = ["Internal", "Postcodes (legacy)"];
  out["/insights/network"] = ["Exploration", "Network"];
  out["/insights/timecube"] = ["Exploration", "Event Timeline Map"];
  out["/insights/journeys"] = ["Internal", "Visitor Activity"];
  out["/insights/journey-map"] = ["Exploration", "Journey Map"];
  out["/insights/postcode-areas"] = ["Internal", "Postcode Overview"];
  out["/insights/postcode-areas/map"] = ["Exploration", "Postcode Pathways"];
  out["/insights/org-connections"] = ["Exploration", "Org Connections"];
  out["/insights/trends"] = ["Exploration", "Trends"];
  out["/insights/organisations"] = ["Internal", "Organisations"];
  out["/insights/calendar"] = ["Directory", "Calendar"];
  out["/insights/help"] = ["Directory", "Help"];
  out["/insights/overview"] = ["Internal", "System Overview"];
  out["/insights/imports"] = ["Internal", "Imports"];
  return out;
})();

function getBreadcrumbFor(pathname: string): string[] {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname];
  // Match longest known prefix for breadcrumb
  const segs = pathname.split("/").filter(Boolean);
  while (segs.length) {
    const candidate = "/" + segs.join("/");
    if (BREADCRUMBS[candidate]) return BREADCRUMBS[candidate];
    segs.pop();
  }
  return [];
}

export default function Layout() {
  const { data: me } = useMe();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);

  // Cmd-K / Ctrl-K opens the global command menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isStaff = !!me?.is_staff;
  const visibleNav: NavEntry[] = NAV.filter((e) => !e.staff || isStaff).map((e) => {
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
  const breadcrumb = getBreadcrumbFor(location.pathname);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur bg-bg/85 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
          <MainMenu nav={visibleNav} me={me} />
          {breadcrumb.length > 0 && (
            <h1 className="heading-sub truncate text-base">
              {breadcrumb.map((item, idx) => (
                <span key={item}>
                  {idx > 0 && <span className="text-muted/60 mx-1.5">/</span>}
                  <span>{item}</span>
                </span>
              ))}
            </h1>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="btn-ghost text-muted text-xs"
              title="Search (⌘K)"
            >
              <span>Search</span>
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-card text-[10px]">
                ⌘K
              </kbd>
            </button>
            <NavLink
              to="/insights/help"
              className={({ isActive }) =>
                `btn-ghost text-muted text-sm font-semibold ${isActive ? "text-accent" : ""}`
              }
              title="Help & glossary"
            >
              ?
            </NavLink>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border text-xs text-muted py-3 text-center flex items-center justify-center gap-2">
        <div className="h-5">
          <Logo height={60} />
        </div>
      </footer>
      <SearchModal open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

function MainMenu({ nav, me }: { nav: NavEntry[]; me?: ReturnType<typeof useMe>["data"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  const handleLogout = async () => {
    setOpen(false);
    await api("/api/auth/logout/", { method: "POST" });
    qc.removeQueries({ queryKey: ["me"] });
    navigate("/login");
  };

  // Split entries: leaves (top of panel) and groups (sections below).
  const leaves = nav.filter((e): e is NavLeaf => !isGroup(e));
  const groups = nav.filter(isGroup);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open navigation menu"
        className="font-display font-bold tracking-tight text-xl shrink-0 inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-border/40"
      >
        <div 
          className="w-5 h-5 transition-transform duration-600"
          style={{
            transform: open ? "rotate(360deg)" : "rotate(0deg)",
          }}
        >
          <BrandShape name="cog-pink" size={20} opacity={0.8} />
        </div>
        <span>
          SADIE<span className="text-accent">.</span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className={"text-muted transition-transform " + (open ? "rotate-180" : "")}
        >
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1 min-w-[240px] rounded-md border border-border bg-bg shadow-lg py-1 z-40"
        >
          {leaves.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              role="menuitem"
              className={({ isActive }) =>
                "block px-3 py-1.5 text-sm hover:bg-border/40 " +
                (isActive ? "text-fg font-medium bg-border/30" : "text-fg")
              }
            >
              {item.label}
            </NavLink>
          ))}
          {groups.map((group, gi) => (
            <div key={group.label}>
              {(leaves.length > 0 || gi > 0) && (
                <div className="my-1 border-t border-border" />
              )}
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-widest font-display text-muted">
                {group.label}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  className={({ isActive }) =>
                    "block px-3 py-1.5 text-sm hover:bg-border/40 " +
                    (isActive ? "text-fg font-medium bg-border/30" : "text-fg")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          {me && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="px-3 py-2">
                <div className="text-xs uppercase tracking-widest font-display text-muted">
                  Plymouth Culture
                </div>
                <div className="text-sm font-medium text-fg mt-1">{me.username}</div>
              </div>
              <button
                onClick={handleLogout}
                role="menuitem"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-border/40 text-fg transition-colors"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
