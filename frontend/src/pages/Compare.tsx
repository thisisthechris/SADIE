import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportWeek, toIsoDate, useFilters } from "../lib/filters";
import { LoadingState } from "../components/EmptyState";
import { BigStat } from "../components/BigStat";
import OrgToggle from "../components/OrgToggle";

interface SummaryData {
  event_count: number;
  interaction_count: number;
  unique_visitors: number;
}

interface Range {
  start: string;
  end: string;
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

function pctChange(current: number, previous: number): number {
  if (previous > 0) return Math.round(((current - previous) / previous) * 1000) / 10;
  return current > 0 ? 100 : 0;
}

/**
 * Compare: side-by-side metrics for two date ranges. Defaults to the latest
 * complete week against the week before, matching the weekly report.
 */
export default function Compare() {
  const { org, category } = useFilters();
  const latest = reportWeek();
  const [current, setCurrent] = useState<Range>(latest);
  const [previous, setPrevious] = useState<Range>({
    start: shiftDays(latest.start, -7),
    end: shiftDays(latest.end, -7),
  });

  const useSummary = (range: Range) =>
    useQuery<SummaryData>({
      queryKey: ["stats", "summary", org, category, range.start, range.end],
      queryFn: async () => {
        const params = new URLSearchParams({ date_from: range.start, date_to: range.end });
        if (org) params.append("org", String(org));
        if (category) params.append("category", String(category));
        const res = await fetch(`/api/analytics/stats/summary/?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch summary");
        return res.json();
      },
      enabled: Boolean(range.start && range.end),
    });

  const a = useSummary(current);
  const b = useSummary(previous);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main mb-2">Compare</h1>
          <p className="body-lg">
            Side-by-side view of two date ranges. Starts with the latest week against the week before.
          </p>
        </div>
        <OrgToggle />
      </div>

      <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <RangePicker title="Period 1" value={current} onChange={setCurrent} />
        <RangePicker title="Period 2" value={previous} onChange={setPrevious} />
      </div>

      {a.isLoading || b.isLoading ? (
        <LoadingState />
      ) : a.data && b.data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="heading-small text-center">
              Period 1: {current.start} to {current.end}
            </h3>
            <BigStat
              value={a.data.event_count}
              label="Events"
              deltaPercent={pctChange(a.data.event_count, b.data.event_count)}
              comparisonLabel="period 2"
            />
            <BigStat
              value={a.data.unique_visitors}
              label="Unique Visitors"
              deltaPercent={pctChange(a.data.unique_visitors, b.data.unique_visitors)}
              comparisonLabel="period 2"
            />
            <BigStat
              value={a.data.interaction_count}
              label="Total Interactions"
              deltaPercent={pctChange(a.data.interaction_count, b.data.interaction_count)}
              comparisonLabel="period 2"
            />
          </div>
          <div className="space-y-4">
            <h3 className="heading-small text-center text-muted">
              Period 2: {previous.start} to {previous.end}
            </h3>
            <PlainStat value={b.data.event_count} label="Events" />
            <PlainStat value={b.data.unique_visitors} label="Unique Visitors" />
            <PlainStat value={b.data.interaction_count} label="Total Interactions" />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted text-center py-12">Choose a start and end date for both periods.</p>
      )}
    </div>
  );
}

function RangePicker({ title, value, onChange }: { title: string; value: Range; onChange: (r: Range) => void }) {
  return (
    <div>
      <h2 className="heading-small mb-3">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-muted">
          Start
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded text-sm mt-1"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          End
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded text-sm mt-1"
          />
        </label>
      </div>
    </div>
  );
}

function PlainStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="card p-6">
      <div className="heading-main mb-2">{value.toLocaleString()}</div>
      <div className="heading-sub">{label}</div>
    </div>
  );
}
