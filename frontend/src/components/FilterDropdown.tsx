import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import type { Category, OrganisationSummary, Paginated } from "../lib/types";
import SaveViewButton from "./SaveViewButton";

const PERIODS = [
  { v: "", l: "All time" },
  { v: "7d", l: "Last 7 days" },
  { v: "30d", l: "Last 30 days" },
  { v: "90d", l: "Last 90 days" },
  { v: "1y", l: "Last year" },
];

/** Count how many filter fields are non-empty (excluding empty strings). */
function useActiveFilterCount() {
  const f = useFilters();
  return [f.org, f.category, f.date_from, f.date_to, f.period, f.itype].filter(
    Boolean
  ).length;
}

export default function FilterDropdown({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const f = useFilters();
  const activeCount = useActiveFilterCount();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const orgs = useQuery({
    queryKey: ["filter-orgs"],
    queryFn: () =>
      api<Paginated<OrganisationSummary>>("/api/organisations/", {
        query: { page_size: 200, ordering: "name" },
      }),
    staleTime: 5 * 60_000,
  });
  const cats = useQuery({
    queryKey: ["filter-cats"],
    queryFn: () =>
      api<Paginated<Category>>("/api/events/categories/", {
        query: { page_size: 200, ordering: "name" },
      }),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={onToggle}
        className={`btn-ghost text-xs flex items-center gap-1.5 ${
          activeCount > 0 ? "text-accent" : ""
        }`}
        title="Filters"
        aria-expanded={open}
      >
        {/* Funnel icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 flex-shrink-0"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-border bg-card shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted font-medium">
              Filters
            </span>
            {activeCount > 0 && (
              <button onClick={f.reset} className="btn-ghost text-xs text-muted">
                Reset all
              </button>
            )}
          </div>

          <Field label="Organisation">
            <select
              className="input"
              value={f.org}
              onChange={(e) => f.set({ org: e.target.value })}
            >
              <option value="">All organisations</option>
              {orgs.data?.results.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category">
            <select
              className="input"
              value={f.category}
              onChange={(e) => f.set({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {cats.data?.results.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Period">
            <select
              className="input"
              value={f.period}
              onChange={(e) =>
                f.set({ period: e.target.value, date_from: "", date_to: "" })
              }
            >
              {PERIODS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2">
            <Field label="From">
              <input
                type="date"
                className="input"
                value={f.date_from}
                onChange={(e) =>
                  f.set({ date_from: e.target.value, period: "" })
                }
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="input"
                value={f.date_to}
                onChange={(e) => f.set({ date_to: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Type">
            <select
              className="input"
              value={f.itype}
              onChange={(e) => f.set({ itype: e.target.value })}
            >
              <option value="">All types</option>
              <option value="event">Events</option>
              <option value="location">Locations</option>
            </select>
          </Field>

          <div className="pt-1 border-t border-border">
            <SaveViewButton />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
