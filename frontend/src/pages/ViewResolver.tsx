import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { periodRange, useFilters } from "../lib/filters";
import { useSavedView } from "../lib/savedViews";

/**
 * `/app/v/:slug` — fetches a SavedView, hydrates the filter store from its
 * stored querystring, then redirects to its target SPA path.
 */
export default function ViewResolver() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useSavedView(slug);
  const f = useFilters();
  const nav = useNavigate();

  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(data.query_string || "");
    const patch: Record<string, string> = {};
    params.forEach((v, k) => {
      patch[k] = v;
    });
    f.reset();
    // Views saved before the weekly report stored no dates (meaning all time)
    // or a day-based period; derive their range rather than keep the default 12 weeks.
    const hasDates = "date_from" in patch || "date_to" in patch;
    const period = patch.period ?? "";
    f.set({ period: hasDates ? "custom" : period, ...(hasDates ? {} : periodRange(period)), ...patch });
    // Strip /app prefix if present, since router is mounted at /
    const path = data.path.replace(/^\/app/, "") || "/";
    nav(path, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (isLoading) {
    return <div className="card p-6 text-sm text-muted">Loading saved view…</div>;
  }
  if (error) {
    return (
      <div className="card p-6 text-sm text-red-400">
        Could not load this view (it may be private or deleted).
      </div>
    );
  }
  return null;
}
