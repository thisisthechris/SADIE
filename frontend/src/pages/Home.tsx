import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useMe } from "../lib/auth";
import type {
  StatsSummary,
  TopOrgsResponse,
  TopCategoriesResponse,
  TimeseriesResponse,
} from "../lib/types";
import ExportMenu from "../components/ExportMenu";
import RecommendationsWidget from "../components/RecommendationsWidget";
import PartnerBadge from "../components/PartnerBadge";
import EmptyState from "../components/EmptyState";
import { downloadCsv } from "../lib/export";

export default function Home() {
  const f = useFilters();
  const q = f.asQuery();
  const { data: me } = useMe();
  const myOrgs = me?.member_organisations ?? [];

  const summary = useQuery({
    queryKey: ["stats-summary", q],
    queryFn: () => api<StatsSummary>("/api/analytics/stats/summary/", { query: q }),
  });
  const top = useQuery({
    queryKey: ["stats-top-orgs", q],
    queryFn: () =>
      api<TopOrgsResponse>("/api/analytics/stats/top-orgs/", { query: q }),
  });
  const cats = useQuery({
    queryKey: ["stats-top-cats", q],
    queryFn: () =>
      api<TopCategoriesResponse>("/api/analytics/stats/top-categories/", {
        query: q,
      }),
  });
  const ts = useQuery({
    queryKey: ["stats-ts", q],
    queryFn: () =>
      api<TimeseriesResponse>("/api/analytics/stats/interactions-timeseries/", {
        query: q,
      }),
  });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-small">Overview</h1>
        <p className="text-sm text-muted">
          High-level signals across Plymouth&rsquo;s arts &amp; cultural data.
        </p>
      </div>

      {myOrgs.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">
            Your organisation{myOrgs.length === 1 ? "" : "s"}
          </div>
          <div className="flex flex-wrap gap-2">
            {myOrgs.map((o) => (
              <Link
                key={o.id}
                to={`/organisations/${o.slug}`}
                className="inline-flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10"
              >
                <span className="font-medium">{o.name}</span>
                {o.is_partner && <PartnerBadge />}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Organisations" value={s?.org_count} to="/organisations" />
        <Stat label="Locations" value={s?.location_count} to="/map3d" />
        <Stat label="Events" value={s?.event_count} to="/calendar" />
        <Stat label="Interactions" value={s?.interaction_count} to="/journeys" />
        <Stat label="Unique visitors" value={s?.unique_visitors} to="/journeys" />
        <Stat label="Postcode hits" value={s?.postcode_count} to="/postcodes3d" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-sub">Top organisations</h2>
            <ExportMenu
              items={[
                {
                  label: "Download CSV",
                  onClick: () =>
                    downloadCsv(
                      "top-organisations.csv",
                      top.data?.results ?? [],
                      [
                        { key: "organisation__name", label: "Organisation" },
                        { key: "organisation__slug", label: "Slug" },
                        { key: "n", label: "Interactions" },
                      ],
                    ),
                  disabled: !top.data?.results.length,
                },
              ]}
            />
          </div>
          <RankList
            rows={(top.data?.results ?? []).map((r) => ({
              label: r.organisation__name,
              n: r.n,
            }))}
          />
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-sub">Top categories</h2>
            <ExportMenu
              items={[
                {
                  label: "Download CSV",
                  onClick: () =>
                    downloadCsv(
                      "top-categories.csv",
                      cats.data?.results ?? [],
                      [
                        { key: "name", label: "Category" },
                        { key: "slug", label: "Slug" },
                        { key: "n", label: "Interactions" },
                      ],
                    ),
                  disabled: !cats.data?.results.length,
                },
              ]}
            />
          </div>
          <RankList
            rows={(cats.data?.results ?? []).map((r) => ({
              label: r.name,
              n: r.n,
            }))}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 card p-4">
          <h2 className="heading-sub mb-3">Interactions over time</h2>
          <Sparkline points={(ts.data?.series ?? []).map((p) => p.count)} />
        </div>
        <RecommendationsWidget />
      </section>

      <section className="card p-4">
        <h2 className="heading-sub mb-3">Upcoming events</h2>
        <ul className="divide-y divide-border">
          {(s?.upcoming_events ?? []).map((e) => (
            <li key={e.id} className="py-2 flex items-center gap-3">
              <div className="text-xs text-muted w-28 tabular-nums">
                {new Date(e.start_datetime).toLocaleString()}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/events/${e.id}`}
                  className="truncate font-medium hover:text-accent block"
                >
                  {e.title}
                </Link>
                <div className="text-xs text-muted truncate">
                  {e.organisation__name}
                  {e.location__name ? ` · ${e.location__name}` : ""}
                </div>
              </div>
              {e.url && (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost text-xs"
                >
                  Open
                </a>
              )}
            </li>
          ))}
          {!s?.upcoming_events?.length && (
            <li className="py-2 text-sm text-muted">No upcoming events.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  to,
}: {
  label: string;
  value?: number;
  to?: string;
}) {
  const inner = (
    <>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value === undefined ? "—" : value.toLocaleString()}
      </div>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="stat hover:bg-border/30 transition-colors block"
      >
        {inner}
      </Link>
    );
  }
  return <div className="stat">{inner}</div>;
}

function RankList({ rows }: { rows: Array<{ label: string; n: number }> }) {
  if (!rows.length) return <EmptyState message="No data" shape="cog-pink" />;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between">
            <span className="truncate">{r.label}</span>
            <span className="text-muted tabular-nums">{r.n}</span>
          </div>
          <div className="h-1 bg-border/50 rounded mt-1">
            <div
              className="h-1 bg-accent rounded"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) {
    return <div className="text-sm text-muted">No data.</div>;
  }
  const w = 600;
  const h = 80;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-20 text-accent"
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
