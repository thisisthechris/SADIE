import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import InfoTooltip from "../components/InfoTooltip";
import AnimatedNumber from "./AnimatedNumber";

interface EngagementResp {
  current_month_interactions: number;
  current_month_events: number;
  previous_month_interactions: number;
  previous_month_events: number;
  buzz_current: number;
  buzz_previous: number;
  buzz_change: number;
  current_quarter_interactions: number;
  current_quarter_events: number;
  previous_quarter_interactions: number;
  previous_quarter_events: number;
  quarter_events_pct_change: number;
  quarter_interactions_pct_change: number;
  quarter_buzz_current: number;
  quarter_buzz_previous: number;
  quarter_buzz_change: number;
}

/**
 * EngagementAtAGlance: "Buzz" (interactions/event) + events + interactions,
 * each compared against the prior period. Supports a Month/Quarter toggle so
 * the same card can answer "how are we doing vs last month" and "vs last
 * quarter" — shared by the Trends page and the Insights front page.
 */
export default function EngagementAtAGlance() {
  const { org, category, date_from, date_to, search } = useFilters();
  const [range, setRange] = useState<"month" | "quarter">("month");

  const params = new URLSearchParams();
  if (org) params.append("org", String(org));
  if (category) params.append("category", String(category));
  if (date_from) params.append("date_from", date_from);
  if (date_to) params.append("date_to", date_to);
  if (search) params.append("search", search);

  const engagement = useQuery<EngagementResp>({
    queryKey: ["stats", "engagement", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/engagement/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch engagement data");
      return res.json();
    },
  });

  if (!engagement.data) return null;
  const d = engagement.data;

  const isMonth = range === "month";
  const buzzCurrent = isMonth ? d.buzz_current : d.quarter_buzz_current;
  const buzzChange = isMonth ? d.buzz_change : d.quarter_buzz_change;
  const currentEvents = isMonth ? d.current_month_events : d.current_quarter_events;
  const previousEvents = isMonth ? d.previous_month_events : d.previous_quarter_events;
  const currentInteractions = isMonth ? d.current_month_interactions : d.current_quarter_interactions;
  const previousInteractions = isMonth ? d.previous_month_interactions : d.previous_quarter_interactions;
  const periodLabel = isMonth ? "last month" : "last quarter";

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="heading-small">Engagement at a Glance</h2>
          <InfoTooltip text="buzz_per_event" />
        </div>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          <button
            className={`px-3 py-1.5 ${isMonth ? "bg-accent text-white" : "hover:bg-border/20"}`}
            onClick={() => setRange("month")}
          >
            This month
          </button>
          <button
            className={`px-3 py-1.5 ${!isMonth ? "bg-accent text-white" : "hover:bg-border/20"}`}
            onClick={() => setRange("quarter")}
          >
            This quarter
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center p-4 border border-border rounded">
          <div className="text-xs text-muted font-semibold uppercase mb-2">
            Buzz ({isMonth ? "current month" : "current quarter"})
          </div>
          <div className="text-2xl font-bold text-accent">
            <AnimatedNumber value={buzzCurrent} format={(n) => n.toFixed(1)} />
          </div>
          <div className={`text-xs font-medium ${buzzChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {buzzChange > 0 ? "↑" : "↓"} {Math.abs(buzzChange).toFixed(1)}% from {periodLabel}
          </div>
        </div>
        <div className="text-center p-4 border border-border rounded">
          <div className="text-xs text-muted font-semibold uppercase mb-2">
            {isMonth ? "Current Month Events" : "Current Quarter Events"}
          </div>
          <div className="text-2xl font-bold text-accent">
            <AnimatedNumber value={currentEvents} />
          </div>
          <div className="text-xs text-muted">
            vs {previousEvents.toLocaleString()} {periodLabel}
          </div>
        </div>
        <div className="text-center p-4 border border-border rounded">
          <div className="text-xs text-muted font-semibold uppercase mb-2">
            {isMonth ? "Current Month Interactions" : "Current Quarter Interactions"}
          </div>
          <div className="text-2xl font-bold text-accent">
            <AnimatedNumber value={currentInteractions} />
          </div>
          <div className="text-xs text-muted">
            vs {previousInteractions.toLocaleString()} {periodLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
