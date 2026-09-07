import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { WeekdayBars } from "../components/WeekdayBars";
import { PeakTimesBar } from "../components/PeakTimesBar";
import { RankedBar } from "../components/RankedBar";
import EmptyState, { LoadingState } from "../components/EmptyState";
import AnimatedNumber from "../components/AnimatedNumber";

interface CategoryInfo {
  id: number;
  name: string;
  slug: string;
  event_count: number;
}

interface SummaryResp {
  event_count: number;
  interaction_count: number;
  unique_visitors: number;
}

interface WeekdayData {
  weekday: number;
  weekday_name: string;
  events: number;
  interactions: number;
}

interface PeakTimeData {
  hour: number;
  label: string;
  events: number;
}

interface TopVenueData {
  location_id: number;
  name: string;
  organisation: string;
  event_count: number;
  interaction_count: number;
}

/**
 * CategoryDetail: deep-dive for a single event category — reuses the same
 * stats endpoints Trends.tsx uses for organisations, scoped by `category`
 * instead of `org` (both filters are supported by the same query helpers).
 */
export default function CategoryDetail() {
  const { id = "" } = useParams();
  const f = useFilters();
  const { category: _ignored, ...globalFilters } = f.asQuery();
  const params = new URLSearchParams({ ...globalFilters, category: id });

  const info = useQuery({
    queryKey: ["category-info", id],
    staleTime: 5 * 60_000,
    queryFn: () => fetch(`/api/events/categories/${id}/`).then((r) => r.json() as Promise<CategoryInfo>),
  });

  const summary = useQuery({
    queryKey: ["category-summary", id, globalFilters],
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetch(`/api/analytics/stats/summary/?${params.toString()}`).then((r) => r.json() as Promise<SummaryResp>),
  });

  const weekday = useQuery({
    queryKey: ["category-weekday", id, globalFilters],
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetch(`/api/analytics/stats/activity-by-weekday/?${params.toString()}`).then(
        (r) => r.json() as Promise<{ series: WeekdayData[] }>,
      ),
  });

  const peakTimes = useQuery({
    queryKey: ["category-peak-times", id, globalFilters],
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetch(`/api/analytics/stats/peak-times/?${params.toString()}`).then(
        (r) => r.json() as Promise<{ series: PeakTimeData[] }>,
      ),
  });

  const topVenues = useQuery({
    queryKey: ["category-top-venues", id, globalFilters],
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetch(`/api/analytics/stats/top-venues/?${params.toString()}&limit=15`).then(
        (r) => r.json() as Promise<{ results: TopVenueData[] }>,
      ),
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/insights/categories" className="text-sm text-accent hover:underline">
          ← All categories
        </Link>
      </div>

      <div>
        <h1 className="heading-main">{info.data?.name ?? "…"}</h1>
        <p className="body-lg">Activity, timing and venue patterns for this category.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Events" value={summary.data?.event_count} />
        <Stat label="Interactions" value={summary.data?.interaction_count} />
        <Stat label="Unique visitors" value={summary.data?.unique_visitors} />
      </div>

      <div className="card p-4">
        <h2 className="heading-sub mb-3">Activity by Day of Week</h2>
        {weekday.isLoading ? (
          <LoadingState variant="chart" />
        ) : weekday.data?.series?.length ? (
          <WeekdayBars data={weekday.data.series} />
        ) : (
          <EmptyState message="No activity data for this category yet." />
        )}
      </div>

      <div className="card p-4">
        <h2 className="heading-sub mb-3">Peak Times of Day</h2>
        {peakTimes.isLoading ? (
          <LoadingState variant="chart" />
        ) : peakTimes.data?.series?.some((d) => d.events > 0) ? (
          <PeakTimesBar data={peakTimes.data.series} />
        ) : (
          <EmptyState message="No event start-time data for this category." />
        )}
      </div>

      <div className="card p-4">
        <h2 className="heading-sub mb-3">Top Venues</h2>
        {topVenues.isLoading ? (
          <LoadingState variant="chart" />
        ) : topVenues.data?.results?.length ? (
          <RankedBar
            data={topVenues.data.results.map((v) => ({ name: v.name, value: v.interaction_count }))}
            label="Visitor interactions"
            color="#14b8a6"
          />
        ) : (
          <EmptyState message="No venue data for this category yet." />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="card card-hover p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value === undefined ? "—" : <AnimatedNumber value={value} />}
      </div>
    </div>
  );
}
