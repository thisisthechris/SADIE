import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { LoadingState } from "../components/EmptyState";
import EmptyState from "../components/EmptyState";
import { BigStat } from "../components/BigStat";

interface SummaryData {
  event_count: number;
  interaction_count: number;
  unique_visitors: number;
}

type CompareMode = "organisations" | "periods";

/**
 * Compare: Side-by-side comparison of metrics.
 * - Mode A: Two organisations
 * - Mode B: Two date periods (current month vs previous month, or custom range)
 */
export default function Compare() {
  const { org, category, date_from, date_to } = useFilters();
  const [mode, setMode] = useState<CompareMode>("organisations");

  // For org comparison: fetch summary for current org and another org
  const [compareOrgId, setCompareOrgId] = useState<number | null>(null);

  // For period comparison: current vs previous month
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");

  // Fetch summaries for org comparison
  const buildOrgParams = (orgId: number | null) => {
    const params = new URLSearchParams();
    if (orgId) params.append("org", String(orgId));
    if (category) params.append("category", String(category));
    if (date_from) params.append("date_from", date_from);
    if (date_to) params.append("date_to", date_to);
    return params.toString();
  };

  const currentOrgSummary = useQuery<SummaryData>({
    queryKey: ["stats", "summary", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/summary/?${buildOrgParams(org ? Number(org) : null)}`
      );
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const compareOrgSummary = useQuery<SummaryData>({
    queryKey: ["stats", "summary", compareOrgId, category, date_from, date_to],
    queryFn: async () => {
      if (!compareOrgId) return null;
      const res = await fetch(
        `/api/analytics/stats/summary/?${buildOrgParams(compareOrgId)}`
      );
      if (!res.ok) throw new Error("Failed to fetch comparison summary");
      return res.json();
    },
    enabled: !!compareOrgId,
  });

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
    enabled: mode === "periods" && !!periodStart && !!periodEnd,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-main mb-2">Compare</h1>
        <p className="body-lg">
          Side-by-side view of two organisations or two time periods.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="compare-mode"
              value="organisations"
              checked={mode === "organisations"}
              onChange={() => setMode("organisations")}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Compare organisations</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="compare-mode"
              value="periods"
              checked={mode === "periods"}
              onChange={() => setMode("periods")}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Compare time periods</span>
          </label>
        </div>
      </div>

      {/* Organisation Comparison */}
      {mode === "organisations" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="heading-small mb-4">Select Organisation to Compare</h2>
            <input
              type="text"
              placeholder="Enter organisation name or ID..."
              onChange={(e) => {
                const val = e.target.value;
                setCompareOrgId(val ? Number(val) : null);
              }}
              className="w-full px-3 py-2 border border-border rounded text-sm"
            />
          </div>

          {currentOrgSummary.isLoading || compareOrgSummary.isLoading ? (
            <LoadingState />
          ) : currentOrgSummary.data && compareOrgSummary.data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="heading-small text-center">Current Selection</h3>
                <BigStat
                  value={currentOrgSummary.data.event_count}
                  label="Events"
                  deltaPercent={0}
                />
                <BigStat
                  value={currentOrgSummary.data.unique_visitors}
                  label="Unique Visitors"
                  deltaPercent={0}
                />
                <BigStat
                  value={currentOrgSummary.data.interaction_count}
                  label="Total Interactions"
                  deltaPercent={0}
                />
              </div>

              <div className="space-y-4">
                <h3 className="heading-small text-center">Comparison</h3>
                <BigStat
                  value={compareOrgSummary.data!.event_count}
                  label="Events"
                  deltaPercent={0}
                />
                <BigStat
                  value={compareOrgSummary.data!.unique_visitors}
                  label="Unique Visitors"
                  deltaPercent={0}
                />
                <BigStat
                  value={compareOrgSummary.data!.interaction_count}
                  label="Total Interactions"
                  deltaPercent={0}
                />
              </div>
            </div>
          ) : (
            <EmptyState message="Enter an organisation ID to compare." />
          )}
        </div>
      )}

      {/* Period Comparison */}
      {mode === "periods" && (
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
      )}
    </div>
  );
}
