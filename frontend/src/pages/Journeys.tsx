import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import ExportMenu from "../components/ExportMenu";
import InfoTooltip from "../components/InfoTooltip";
import { downloadCsv } from "../lib/export";

interface JourneysSummary {
  totals: { interactions: number; unique_users: number };
  monthly: Array<{ month: string | null; count: number }>;
  type_breakdown: Array<{ interaction_type: string; n: number }>;
  unique_users_by_org: Array<{ organisation: string; unique_users: number }>;
  top_users: Array<{ user_hash: string; n: number }>;
  cross_tab: Array<{
    organisation: string;
    interaction_type: string;
    count: number;
  }>;
}

export default function Journeys() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-small">Visitor Activity</h1>
        <p className="text-sm text-muted">
          See when and how people interact with events across all partners.
        </p>
      </div>
      <SummaryView />
    </div>
  );
}

function SummaryView() {
  const f = useFilters();
  const q = f.asQuery();

  const journeys = useQuery({
    queryKey: ["journeys-summary", q],
    queryFn: () =>
      api<JourneysSummary>("/api/analytics/journeys/summary/", { query: q }),
  });

  const data = journeys.data;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Interactions" value={data?.totals.interactions} />
        <Stat label="Unique visitors" value={data?.totals.unique_users} />
        <Stat
          label="Event interactions"
          value={
            data?.type_breakdown.find((r) => r.interaction_type === "event")?.n
          }
        />
        <Stat
          label="Location interactions"
          value={
            data?.type_breakdown.find((r) => r.interaction_type === "location")
              ?.n
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="heading-sub mb-3">Monthly trend</h2>
          <Sparkline
            points={(data?.monthly ?? []).map((p) => p.count)}
            labels={(data?.monthly ?? []).map((p) => p.month ?? "")}
          />
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-sub">Type breakdown</h2>
          </div>
          <Doughnut rows={data?.type_breakdown ?? []} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="heading-sub">Unique visitors per partner</h2>
              <InfoTooltip text="unique_visitor" />
            </div>
            <ExportMenu
              items={[
                {
                  label: "Download CSV",
                  disabled: !data?.unique_users_by_org.length,
                  onClick: () =>
                    downloadCsv(
                      "journeys-unique-by-org.csv",
                      data?.unique_users_by_org ?? [],
                      [
                        { key: "organisation", label: "Organisation" },
                        { key: "unique_users", label: "Unique users" },
                      ],
                    ),
                },
              ]}
            />
          </div>
          <RankList
            rows={(data?.unique_users_by_org ?? []).map((r) => ({
              label: r.organisation,
              n: r.unique_users,
            }))}
          />
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="heading-sub">Top individual visitors</h2>
            <InfoTooltip text="These are anonymised identifiers; no personal information is visible." />
          </div>
          <RankList
            rows={(data?.top_users ?? []).map((r) => ({
              label: r.user_hash || "—",
              n: r.n,
            }))}
          />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="heading-sub">Activity by partner and type</h2>
            <InfoTooltip text="How many times events of each type were visited, broken down by partner." />
          </div>
          <ExportMenu
            items={[
              {
                label: "Download CSV",
                disabled: !data?.cross_tab.length,
                onClick: () =>
                  downloadCsv(
                    "journeys-cross-tab.csv",
                    data?.cross_tab ?? [],
                    [
                      { key: "organisation", label: "Organisation" },
                      { key: "interaction_type", label: "Type" },
                      { key: "count", label: "Count" },
                    ],
                  ),
              },
            ]}
          />
        </div>
        {data?.cross_tab.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1">Organisation</th>
                <th className="py-1">Type</th>
                <th className="py-1 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.cross_tab.map((r, i) => (
                <tr key={`${r.organisation}-${r.interaction_type}-${i}`}>
                  <td className="py-1.5">{r.organisation}</td>
                  <td className="py-1.5 text-muted">{r.interaction_type}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-muted">No data.</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value === undefined ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

function RankList({ rows }: { rows: Array<{ label: string; n: number }> }) {
  if (!rows.length) return <div className="text-sm text-muted">No data.</div>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="text-sm">
          <div className="flex justify-between">
            <span className="truncate font-mono text-xs">{r.label}</span>
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

function Sparkline({ points, labels }: { points: number[]; labels?: string[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!points.length) return <div className="text-sm text-muted">No data.</div>;

  const W = 600, H = 200;
  const PL = 46, PR = 12, PT = 10, PB = 28;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const max = Math.max(...points, 1);
  const n = points.length;
  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yOf = (v: number) => PT + (1 - v / max) * cH;

  const yTicks = [0, Math.round(max / 2), max];
  const xTickCount = Math.min(n, 5);
  const xTickIdxs = Array.from({ length: xTickCount }, (_, k) =>
    Math.round((k / (xTickCount - 1)) * (n - 1))
  );

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p).toFixed(1)}`)
    .join(" ");
  const areaPath =
    linePath +
    ` L ${xOf(n - 1).toFixed(1)} ${yOf(0).toFixed(1)}` +
    ` L ${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)} Z`;

  const handleMouseMove = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.max(0, Math.min(1, (svgX - PL) / cW));
    setHoverIdx(Math.round(frac * (n - 1)));
  };

  const hx = hoverIdx !== null ? xOf(hoverIdx) : null;
  const hy = hoverIdx !== null ? yOf(points[hoverIdx]) : null;
  const hVal = hoverIdx !== null ? points[hoverIdx] : null;
  const hLabel = hoverIdx !== null ? (labels?.[hoverIdx] ?? String(hoverIdx)) : null;
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
      {yTicks.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />
            <text x={PL - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#888">
              {v.toLocaleString()}
            </text>
          </g>
        );
      })}
      <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      {labels && xTickIdxs.map((idx) => (
        <text key={idx} x={xOf(idx)} y={H - 6} textAnchor="middle" fontSize={9} fill="#888">
          {(labels[idx] ?? "").slice(0, 7)}
        </text>
      ))}
      <path d={areaPath} fill="currentColor" fillOpacity={0.08} />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {hx !== null && hy !== null && (
        <>
          <line x1={hx} y1={PT} x2={hx} y2={PT + cH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 2" strokeOpacity={0.5} />
          <circle cx={hx} cy={hy} r={4} fill="currentColor" />
          <circle cx={hx} cy={hy} r={2.5} fill="white" />
          <rect x={tooltipX} y={PT} width={tooltipW} height={tooltipH} rx={4} fill="white" stroke="rgba(0,0,0,0.12)" strokeWidth={1} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
          <text x={tooltipX + tooltipW / 2} y={PT + 11} textAnchor="middle" fontSize={10} fontWeight="600" fill="#001FCC">{hVal?.toLocaleString()}</text>
          <text x={tooltipX + tooltipW / 2} y={PT + 24} textAnchor="middle" fontSize={9} fill="#545454">{hLabel?.slice(0, 7)}</text>
        </>
      )}
    </svg>
  );
}

const SLICE_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa"];

function Doughnut({
  rows,
}: {
  rows: Array<{ interaction_type: string; n: number }>;
}) {
  const total = rows.reduce((acc, r) => acc + r.n, 0);
  if (!total) return <div className="text-sm text-muted">No data.</div>;
  const cx = 60;
  const cy = 60;
  const r = 50;
  const inner = 28;
  let angle = -Math.PI / 2;
  const slices = rows.map((row, i) => {
    const frac = row.n / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const xi1 = cx + inner * Math.cos(a1);
    const yi1 = cy + inner * Math.sin(a1);
    const xi0 = cx + inner * Math.cos(a0);
    const yi0 = cy + inner * Math.sin(a0);
    const d = [
      `M ${x0} ${y0}`,
      `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
      `L ${xi1} ${yi1}`,
      `A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0}`,
      "Z",
    ].join(" ");
    return { d, color: SLICE_COLORS[i % SLICE_COLORS.length], row, frac };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
        {slices.map((s) => (
          <path key={s.row.interaction_type} d={s.d} fill={s.color} />
        ))}
      </svg>
      <ul className="text-sm space-y-1">
        {slices.map((s) => (
          <li
            key={s.row.interaction_type}
            className="flex items-center gap-2"
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="capitalize">{s.row.interaction_type}</span>
            <span className="text-muted tabular-nums">
              {s.row.n.toLocaleString()} ({Math.round(s.frac * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
