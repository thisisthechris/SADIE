import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { StatsSummary, TimeseriesResponse, Paginated } from "../lib/types";

// ── Inline types for pipeline data ─────────────────────────────────────────

type ScrapeRun = {
  id: number;
  source_name: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  events_found: number;
  events_created: number;
  events_updated: number;
  events_skipped: number;
  error_message: string;
};

const IMPORT_STATUSES = [
  { key: "pending", label: "Pending review" },
  { key: "auto_matched", label: "Auto-matched" },
  { key: "approved", label: "Approved" },
  { key: "imported", label: "Imported" },
  { key: "rejected", label: "Rejected" },
] as const;

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const summary = useQuery({
    queryKey: ["stats-summary-overview"],
    queryFn: () => api<StatsSummary>("/api/analytics/stats/summary/", { query: {} }),
  });
  const ts = useQuery({
    queryKey: ["stats-ts-overview"],
    queryFn: () =>
      api<TimeseriesResponse>("/api/analytics/stats/interactions-timeseries/", { query: {} }),
  });
  const runs = useQuery({
    queryKey: ["scrape-runs-recent"],
    queryFn: () =>
      api<Paginated<ScrapeRun>>("/api/runs/", {
        query: { ordering: "-started_at", page_size: "10" },
      }),
  });
  const importCounts = useQuery({
    queryKey: ["imports-counts-overview"],
    queryFn: () => api<Record<string, number>>("/api/imports/counts/"),
  });

  const s = summary.data;
  const pending = importCounts.data?.pending ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="heading-main">System Overview</h1>
        <p className="body-lg">
          Data ingestion status and recent import activity. (Internal staff view only.)
        </p>
      </div>

      {/* ── Headline stats ── */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Events" value={s?.event_count} to="/insights/calendar" />
        <Stat label="Interactions" value={s?.interaction_count} to="/insights/journeys" />
        <Stat label="Unique visitors" value={s?.unique_visitors} to="/insights/journeys" />
        <Stat
          label="Pending imports"
          value={importCounts.data !== undefined ? pending : undefined}
          to="/insights/imports"
          highlight={pending > 0}
        />
      </section>

      {/* ── Pipeline: scrape runs + import queue ── */}
      <section className="grid gap-4 lg:grid-cols-3">

        {/* Recent scrape runs */}
        <div className="lg:col-span-2 card p-4">
          <h2 className="heading-sub mb-3">Recent scrape runs</h2>
          {runs.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {!runs.isLoading && !runs.data?.results.length && (
            <p className="text-sm text-muted">No scrape runs recorded yet.</p>
          )}
          <ul className="divide-y divide-border">
            {(runs.data?.results ?? []).map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-3">
                <StatusBadge status={r.status} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.source_name}</div>
                  <div className="text-xs text-muted">
                    {r.events_found} found · {r.events_created} created · {r.events_updated} updated
                    {r.error_message ? (
                      <span className="text-red-400 ml-1 truncate">— {r.error_message}</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-muted tabular-nums flex-shrink-0">
                  <RelativeTime iso={r.started_at} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Import queue breakdown */}
        <div className="card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-sub">Import queue</h2>
            <Link to="/insights/imports" className="btn-ghost text-xs">
              Review →
            </Link>
          </div>
          {importCounts.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {importCounts.data && (
            <ImportQueueBreakdown counts={importCounts.data} />
          )}
        </div>
      </section>

      {/* ── Interactions over time ── */}
      <section className="card p-4">
        <h2 className="heading-sub mb-3">Interactions over time</h2>
        <Sparkline
          points={(ts.data?.series ?? []).map((p) => p.count)}
          labels={(ts.data?.series ?? []).map((p) => p.month ?? "")}
        />
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  to,
  highlight,
}: {
  label: string;
  value?: number;
  to?: string;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${highlight ? " text-accent" : ""}`}>
        {value === undefined ? "—" : value.toLocaleString()}
      </div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="stat hover:bg-border/30 transition-colors block">
        {inner}
      </Link>
    );
  }
  return <div className="stat">{inner}</div>;
}

function StatusBadge({ status }: { status: ScrapeRun["status"] }) {
  const styles: Record<ScrapeRun["status"], string> = {
    success: "bg-green-100 text-green-700",
    running: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ImportQueueBreakdown({ counts }: { counts: Record<string, number> }) {
  const total = IMPORT_STATUSES.reduce((s, { key }) => s + (counts[key] ?? 0), 0);
  const max = Math.max(1, ...IMPORT_STATUSES.map(({ key }) => counts[key] ?? 0));
  return (
    <ol className="space-y-2 flex-1">
      {IMPORT_STATUSES.map(({ key, label }) => {
        const n = counts[key] ?? 0;
        return (
          <li key={key} className="text-sm">
            <div className="flex justify-between mb-0.5">
              <span className="text-muted">{label}</span>
              <span className="tabular-nums font-medium">{n}</span>
            </div>
            <div className="h-1 bg-border/50 rounded">
              <div
                className="h-1 bg-accent rounded transition-all"
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
      <li className="text-xs text-muted pt-1 border-t border-border">
        {total.toLocaleString()} total imported events
      </li>
    </ol>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return <>just now</>;
  if (mins < 60) return <>{mins}m ago</>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <>{hrs}h ago</>;
  const days = Math.floor(hrs / 24);
  return <>{days}d ago</>;
}

function Sparkline({ points, labels }: { points: number[]; labels?: string[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!points.length) return <div className="text-sm text-muted">No data.</div>;

  // Layout constants (SVG user-space)
  const W = 600, H = 200;
  const PL = 46, PR = 12, PT = 10, PB = 28;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const max = Math.max(...points, 1);
  const n = points.length;
  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yOf = (v: number) => PT + (1 - v / max) * cH;

  // Y-axis ticks: 0, 50%, 100%
  const yTicks = [0, Math.round(max / 2), max];

  // X-axis labels: show first, last, and a couple in between (evenly spaced, ≤5)
  const xTickCount = Math.min(n, 5);
  const xTickIdxs = Array.from({ length: xTickCount }, (_, k) =>
    Math.round((k / (xTickCount - 1)) * (n - 1))
  );

  // Line path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p).toFixed(1)}`)
    .join(" ");

  // Area fill path
  const areaPath =
    linePath +
    ` L ${xOf(n - 1).toFixed(1)} ${yOf(0).toFixed(1)}` +
    ` L ${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)} Z`;

  // Mouse handler: find nearest point by x position
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const chartX = svgX - PL;
    const frac = Math.max(0, Math.min(1, chartX / cW));
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(idx);
  };

  const hx = hoverIdx !== null ? xOf(hoverIdx) : null;
  const hy = hoverIdx !== null ? yOf(points[hoverIdx]) : null;
  const hVal = hoverIdx !== null ? points[hoverIdx] : null;
  const hLabel = hoverIdx !== null ? (labels?.[hoverIdx] ?? String(hoverIdx)) : null;

  // Tooltip box
  const tooltipW = 80, tooltipH = 32;
  const tooltipX = hx !== null
    ? Math.max(PL, Math.min(W - PR - tooltipW, (hx ?? 0) - tooltipW / 2))
    : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full text-accent"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* Horizontal gridlines + Y-axis labels */}
      {yTicks.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line
              x1={PL} y1={y} x2={W - PR} y2={y}
              stroke="rgba(0,0,0,0.08)" strokeWidth={1}
            />
            <text
              x={PL - 6} y={y}
              textAnchor="end" dominantBaseline="middle"
              fontSize={9} fill="#888"
            >
              {v.toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* X-axis baseline */}
      <line
        x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH}
        stroke="rgba(0,0,0,0.15)" strokeWidth={1}
      />

      {/* X-axis labels */}
      {labels && xTickIdxs.map((idx) => (
        <text
          key={idx}
          x={xOf(idx)} y={H - 6}
          textAnchor="middle"
          fontSize={9} fill="#888"
        >
          {(labels[idx] ?? "").slice(0, 7)}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="currentColor" fillOpacity={0.08} />

      {/* Line */}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.5} />

      {/* Hover elements */}
      {hx !== null && hy !== null && (
        <>
          {/* Vertical rule */}
          <line
            x1={hx} y1={PT} x2={hx} y2={PT + cH}
            stroke="currentColor" strokeWidth={1} strokeDasharray="3 2" strokeOpacity={0.5}
          />
          {/* Dot */}
          <circle cx={hx} cy={hy} r={4} fill="currentColor" />
          <circle cx={hx} cy={hy} r={2.5} fill="white" />

          {/* Tooltip */}
          <rect
            x={tooltipX} y={PT}
            width={tooltipW} height={tooltipH}
            rx={4} fill="white"
            stroke="rgba(0,0,0,0.12)" strokeWidth={1}
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }}
          />
          <text
            x={tooltipX + tooltipW / 2} y={PT + 11}
            textAnchor="middle" fontSize={10} fontWeight="600" fill="#001FCC"
          >
            {hVal?.toLocaleString()}
          </text>
          <text
            x={tooltipX + tooltipW / 2} y={PT + 24}
            textAnchor="middle" fontSize={9} fill="#545454"
          >
            {hLabel?.slice(0, 7)}
          </text>
        </>
      )}
    </svg>
  );
}
