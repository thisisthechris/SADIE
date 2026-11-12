import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { REPORT } from "../lib/copy";
import InfoTooltip from "../components/InfoTooltip";
import AnimatedNumber from "./AnimatedNumber";

export type ComparePeriod = "week" | "month" | "quarter";

interface PeriodStats {
  period_start: string;
  period_end: string;
  events: number;
  interactions: number;
  buzz: number;
}

interface EngagementResp {
  compare: ComparePeriod;
  current: PeriodStats;
  previous: PeriodStats;
  deltas: { events_pct_change: number; interactions_pct_change: number; buzz_change: number };
}

/** Week / Month / Quarter switch shared by the comparison cards. */
export function CompareToggle({ value, onChange }: { value: ComparePeriod; onChange: (v: ComparePeriod) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium" role="group">
      {(Object.keys(REPORT.compareOptions) as ComparePeriod[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={`px-3 py-1.5 ${value === key ? "bg-accent text-white" : "hover:bg-border/20"}`}
          onClick={() => onChange(key)}
        >
          {REPORT.compareOptions[key].tab}
        </button>
      ))}
    </div>
  );
}

/**
 * EngagementAtAGlance: "Buzz" (interactions/event) + events + interactions for
 * the latest complete week, month or quarter, each compared with the one
 * before. Pass ``compare``/``onCompareChange`` to share the choice with other
 * cards on the page; otherwise the card manages it and defaults to week.
 */
export default function EngagementAtAGlance({
  compare: controlled,
  onCompareChange,
}: {
  compare?: ComparePeriod;
  onCompareChange?: (v: ComparePeriod) => void;
}) {
  const { org, category, date_to, search } = useFilters();
  const [local, setLocal] = useState<ComparePeriod>("week");
  const compare = controlled ?? local;
  const setCompare = onCompareChange ?? setLocal;

  const params = new URLSearchParams({ compare });
  if (org) params.append("org", String(org));
  if (category) params.append("category", String(category));
  if (date_to) params.append("date_to", date_to);
  if (search) params.append("search", search);

  const engagement = useQuery<EngagementResp>({
    queryKey: ["stats", "engagement", org, category, date_to, search, compare],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/engagement/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch engagement data");
      return res.json();
    },
  });

  const labels = REPORT.compareOptions[compare];
  const d = engagement.data;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="heading-small">Engagement at a Glance</h2>
          <InfoTooltip text="buzz_per_event" />
        </div>
        <CompareToggle value={compare} onChange={setCompare} />
      </div>
      {!d ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 border border-border rounded">
            <div className="text-xs text-muted font-semibold uppercase mb-1">Interactions per Event</div>
            <div className="text-[10px] text-muted/70 mb-2">Average engagement generated per event</div>
            <div className="text-2xl font-bold text-accent">
              <AnimatedNumber value={d.current.buzz} format={(n) => n.toFixed(1)} />
            </div>
            <div className={`text-xs font-medium ${d.deltas.buzz_change >= 0 ? "text-green-600" : "text-red-600"}`}>
              {d.deltas.buzz_change > 0 ? "↑" : "↓"} {Math.abs(d.deltas.buzz_change).toFixed(1)}% vs{" "}
              {labels.previous}
            </div>
          </div>
          <div className="text-center p-4 border border-border rounded">
            <div className="text-xs text-muted font-semibold uppercase mb-2">{labels.current}: events</div>
            <div className="text-2xl font-bold text-accent">
              <AnimatedNumber value={d.current.events} />
            </div>
            <div className="text-xs text-muted">
              vs {d.previous.events.toLocaleString()} {labels.previous}
            </div>
          </div>
          <div className="text-center p-4 border border-border rounded">
            <div className="text-xs text-muted font-semibold uppercase mb-2">{labels.current}: interactions</div>
            <div className="text-2xl font-bold text-accent">
              <AnimatedNumber value={d.current.interactions} />
            </div>
            <div className="text-xs text-muted">
              vs {d.previous.interactions.toLocaleString()} {labels.previous}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
