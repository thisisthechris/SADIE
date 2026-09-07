import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  n: number;
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
    </div>
  );
}
