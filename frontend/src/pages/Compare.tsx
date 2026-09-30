import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { LoadingState } from "../components/EmptyState";
import EmptyState from "../components/EmptyState";
import { BigStat } from "../components/BigStat";
import OrgToggle from "../components/OrgToggle";

interface SummaryData {
  event_count: number;
  interaction_count: number;
  unique_visitors: number;
}

/**
 * Compare: Side-by-side comparison of metrics across two time periods.
 */
export default function Compare() {
  const { org, category } = useFilters();

  // For period comparison: current vs previous month
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");

  // For period comparison
  const buildPeriodParams = (dateFromStr: string, dateToStr: string) => {
    const params = new URLSearchParams();
    if (org) params.append("org", String(org));
    if (category) params.append("category", String(category));
    if (dateFromStr) params.append("date_from", dateFromStr);
    if (dateToStr) params.append("date_to", dateToStr);
    return params.toString();
  };

  const period1Summary = useQuery<SummaryData>({
    queryKey: ["stats", "summary", org, category, periodStart, periodEnd],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/summary/?${buildPeriodParams(periodStart, periodEnd)}`
      );
      if (!res.ok) throw new Error("Failed to fetch period 1 summary");
      return res.json();
    },
    enabled: !!periodStart && !!periodEnd,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main mb-2">Compare</h1>
          <p className="body-lg">
            Side-by-side view of two time periods.
          </p>
        </div>
        <OrgToggle />
      </div>

      {/* Period Comparison */}
      <div className="space-y-6">
          <div className="card p-6">
            <h2 className="heading-small mb-4">Select Time Periods</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted">Period 1 Start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">Period 1 End</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {period1Summary.isLoading ? (
            <LoadingState />
          ) : period1Summary.data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="heading-small text-center">
                  Period 1: {periodStart} to {periodEnd}
                </h3>
                <BigStat
                  value={period1Summary.data.event_count}
                  label="Events"
                  deltaPercent={0}
                />
                <BigStat
                  value={period1Summary.data.unique_visitors}
                  label="Unique Visitors"
                  deltaPercent={0}
                />
                <BigStat
                  value={period1Summary.data.interaction_count}
                  label="Total Interactions"
                  deltaPercent={0}
                />
              </div>

              <div className="space-y-4">
                <h3 className="heading-small text-center text-muted">
                  (Period 2 data will appear here)
                </h3>
                <div className="text-center py-12 text-sm text-muted">
                  Select an additional time period to compare.
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="Select both start and end dates to view data." />
          )}
        </div>
    </div>
  );
}
