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

/**
 * Shared filter bar — mirrors the dashboard `_filter_ctx` template helper so
 * the SPA pages can drive the same `analytics.queries` filtering as the legacy
 * Django pages.
 */
export default function FilterBar() {
  const f = useFilters();

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
    <div className="card p-3 flex flex-wrap items-end gap-2 text-sm">
      <Field label="Search">
        <input
          className="input"
          value={f.search}
          onChange={(e) => f.set({ search: e.target.value })}
          placeholder="Title or description…"
        />
      </Field>
      <Field label="Organisation">
        <select
          className="input"
          value={f.org}
          onChange={(e) => f.set({ org: e.target.value })}
        >
          <option value="">All</option>
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
          <option value="">All</option>
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
          onChange={(e) => f.set({ period: e.target.value, date_from: "" })}
        >
          {PERIODS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <input
          type="date"
          className="input"
          value={f.date_from}
          onChange={(e) => f.set({ date_from: e.target.value, period: "" })}
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
      <Field label="Type">
        <select
          className="input"
          value={f.itype}
          onChange={(e) => f.set({ itype: e.target.value })}
        >
          <option value="">All</option>
          <option value="event">Events</option>
          <option value="location">Locations</option>
        </select>
      </Field>
      <button onClick={f.reset} className="btn-ghost text-xs">
        Reset
      </button>
      <SaveViewButton />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-[140px] flex-1">
      <span className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
