import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { FREE_VS_PAID } from "../lib/copy";
import InfoTooltip from "../components/InfoTooltip";

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  n: number;
}

type PriceGroup = "free" | "paid" | "unknown";

interface PriceGroupRow {
  group: PriceGroup;
  events: number;
  events_pct: number;
  attendance: number;
  attendance_pct: number;
}

function ShareBar({ count, pct }: { count: number; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2 flex-1 rounded bg-border/40">
        <span className="block h-2 rounded bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-28 flex-shrink-0 text-right tabular-nums text-sm">
        {count.toLocaleString()} <span className="text-muted">({pct}%)</span>
      </span>
    </div>
  );
}

/** Free vs paid split of events and intended attendance, as counts and % of total. */
function FreeVsPaid({ query }: { query: Record<string, string> }) {
  const result = useQuery({
    queryKey: ["free-vs-paid", query],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const params = new URLSearchParams(query);
      const res = await fetch(`/api/analytics/stats/free-vs-paid/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch free vs paid split");
      return res.json() as Promise<{ results: PriceGroupRow[] }>;
    },
  });
  const rows = result.data?.results ?? [];

  return (
    <div className="card p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="heading-small">{FREE_VS_PAID.title}</h2>
          <InfoTooltip text="free_vs_paid" />
        </div>
        <p className="text-sm text-muted">{FREE_VS_PAID.description}</p>
      </div>
      {result.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : result.isError ? (
        <p className="text-sm text-muted">Couldn't load the free vs paid split.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 font-medium w-40"></th>
              <th className="py-2 font-medium">{FREE_VS_PAID.eventsLabel}</th>
              <th className="py-2 pl-6 font-medium">{FREE_VS_PAID.attendanceLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.group}>
                <td className="py-3 font-medium">{FREE_VS_PAID.groups[r.group]}</td>
                <td className="py-3">
                  <ShareBar count={r.events} pct={r.events_pct} />
                </td>
                <td className="py-3 pl-6">
                  <ShareBar count={r.attendance} pct={r.attendance_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Categories: ranked list of event categories, click through to a deep-dive
 * (top venues, peak times, weekday activity) scoped to that category.
 */
export default function Categories() {
  const f = useFilters();
  const { category: _ignored, ...rest } = f.asQuery();

  const categories = useQuery({
    queryKey: ["top-categories", rest],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ ...rest, limit: "50" });
      const res = await fetch(`/api/analytics/stats/top-categories/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json() as Promise<{ results: CategoryRow[] }>;
    },
  });

  const rows = categories.data?.results ?? [];
  const max = rows[0]?.n ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-main">Categories</h1>
        <p className="body-lg">
          Event categories ranked by activity. Click through for peak times, top venues and weekday patterns.
        </p>
      </div>

      <div className="card overflow-hidden">
        {categories.isLoading ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No categories found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/insights/categories/${c.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-border/10"
                >
                  <span className="w-40 flex-shrink-0 font-medium truncate">{c.name}</span>
                  <span className="h-2 flex-1 rounded bg-border/40">
                    <span
                      className="block h-2 rounded bg-accent"
                      style={{ width: `${(c.n / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-16 flex-shrink-0 text-right tabular-nums text-muted">
                    {c.n.toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FreeVsPaid query={f.asQuery()} />
    </div>
  );
}
