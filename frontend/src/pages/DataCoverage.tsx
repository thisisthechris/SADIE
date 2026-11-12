import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DATA_CALENDAR } from "../lib/copy";
import { bucketLabel } from "../lib/filters";
import { WeekStrip, type OrgCalendar } from "../components/DataCalendar";

/** Staff overview: every partner's last 52 weeks of data, gaps first. */
export default function DataCoverage() {
  const q = useQuery({
    queryKey: ["data-calendar", "all"],
    queryFn: () => api<{ results: OrgCalendar[] }>("/api/analytics/data-calendar/", { query: { weeks: 52 } }),
    // Non-staff get a 403, which retrying won't change.
    retry: false,
  });
  const rows = [...(q.data?.results ?? [])].sort((a, b) => b.gap_weeks - a.gap_weeks);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-main mb-2">{DATA_CALENDAR.coverageTitle}</h1>
        <p className="body-lg">{DATA_CALENDAR.coverageIntro}</p>
      </div>
      <div className="card p-5">
        {q.isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-muted">The coverage overview is for SADIE staff. Your organisation's calendar is on the Upload data page.</p>
        ) : !rows.length ? (
          <p className="text-sm text-muted">No partner organisations yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-medium w-56">Organisation</th>
                <th className="py-2 font-medium">Last 52 weeks</th>
                <th className="py-2 font-medium text-right w-24">Gaps</th>
                <th className="py-2 font-medium text-right w-32">Latest data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.organisation.id}>
                  <td className="py-3 pr-3 font-medium">{r.organisation.name}</td>
                  <td className="py-3">
                    <WeekStrip weeks={r.calendar} size="sm" />
                  </td>
                  <td className={`py-3 text-right tabular-nums ${r.gap_weeks ? "text-amber-700" : "text-green-700"}`}>
                    {r.gap_weeks}
                  </td>
                  <td className="py-3 text-right text-muted">
                    {r.last_week_with_data ? bucketLabel(r.last_week_with_data, "week") : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Link to="/insights/upload" className="btn-ghost text-sm border border-border">
        Upload data →
      </Link>
    </div>
  );
}
