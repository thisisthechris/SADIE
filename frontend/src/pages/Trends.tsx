import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import InfoTooltip from "../components/InfoTooltip";
import OrgToggle from "../components/OrgToggle";
import EmptyState, { LoadingState } from "../components/EmptyState";
import { StackedAreaChart } from "../components/StackedAreaChart";
import { WeekdayBars } from "../components/WeekdayBars";
import { RankedBar } from "../components/RankedBar";

interface NewReturningData {
  month: string;
  new: number;
  returning: number;
}

interface WeekdayData {
  weekday: number;
  weekday_name: string;
  events: number;
  interactions: number;
}

interface CategoryTrendData {
  month: string;
  category: string;
  count: number;
}

interface TopVenueData {
  location_id: number;
  name: string;
  organisation: string;
  event_count: number;
  interaction_count: number;
}

/**
 * Trends: Multi-section dashboard showing key trends across 5 visualizations.
 * - New vs Returning Visitors (line/area chart)
 * - Weekday Activity (bar chart with events + interactions)
 * - Category Trends (stacked area chart)
 * - Top Venues (horizontal bar chart)
 * - Engagement Summary (metric cards)
 */
export default function Trends() {
  const { org, category, date_from, date_to, search } = useFilters();

  // Build filter query params
  const params = new URLSearchParams();
  if (org) params.append("org", String(org));
  if (category) params.append("category", String(category));
  if (date_from) params.append("date_from", date_from);
  if (date_to) params.append("date_to", date_to);
  if (search) params.append("search", search);

  // New vs Returning
  const newReturning = useQuery<{ series: NewReturningData[] }>({
    queryKey: ["stats", "visitors-new-returning", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/visitors-new-returning/?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch new/returning data");
      return res.json();
    },
  });

  // Weekday Activity
  const weekdayActivity = useQuery<{ series: WeekdayData[] }>({
    queryKey: ["stats", "activity-by-weekday", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/activity-by-weekday/?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch weekday data");
      return res.json();
    },
  });

  // Category Trends
  const categoryTrends = useQuery<{ series: CategoryTrendData[] }>({
    queryKey: ["stats", "category-trends", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/category-trends/?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch category trends");
      return res.json();
    },
  });

  // Top Venues
  const topVenues = useQuery<{ results: TopVenueData[] }>({
    queryKey: ["stats", "top-venues", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/top-venues/?${params.toString()}&limit=15`
      );
      if (!res.ok) throw new Error("Failed to fetch top venues");
      return res.json();
    },
  });

  // Engagement
  const engagement = useQuery<{
    current_month_interactions: number;
    current_month_events: number;
    previous_month_interactions: number;
    previous_month_events: number;
    buzz_current: number;
    buzz_previous: number;
    buzz_change: number;
  }>({
    queryKey: ["stats", "engagement", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/stats/engagement/?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch engagement data");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main mb-2">Trends</h1>
          <p className="body-lg">
            Key patterns across your event and visitor activity.
          </p>
        </div>
        <OrgToggle />
      </div>

      {/* New vs Returning */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="heading-small">New vs Returning Visitors</h2>
          <InfoTooltip text="new_vs_returning" />
        </div>
        {newReturning.isLoading ? (
          <LoadingState />
        ) : newReturning.data?.series?.length ? (
          <StackedAreaChart
            data={newReturning.data.series.map((d) => [
              { month: d.month, category: "New", count: d.new },
              { month: d.month, category: "Returning", count: d.returning },
            ]).flat()}
            height={300}
          />
        ) : (
          <EmptyState message="No visitor data available for the selected period." />
        )}
      </div>

      {/* Weekday Activity */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="heading-small">Activity by Day of Week</h2>
          <InfoTooltip text="weekday_activity" />
        </div>
        {weekdayActivity.isLoading ? (
          <LoadingState />
        ) : weekdayActivity.data?.series?.length ? (
          <WeekdayBars data={weekdayActivity.data.series} height={300} />
        ) : (
          <EmptyState message="No activity data available." />
        )}
      </div>

      {/* Category Trends */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="heading-small">Category Trends Over Time</h2>
          <InfoTooltip text="category_trends" />
        </div>
        {categoryTrends.isLoading ? (
          <LoadingState />
        ) : categoryTrends.data?.series?.length ? (
          <StackedAreaChart data={categoryTrends.data.series} height={300} />
        ) : (
          <EmptyState message="No category data available." />
        )}
      </div>

      {/* Top Venues */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="heading-small">Top Venues by Activity</h2>
          <InfoTooltip text="venue_popularity" />
        </div>
        {topVenues.isLoading ? (
          <LoadingState />
        ) : topVenues.data?.results?.length ? (
          <RankedBar
            data={topVenues.data.results.map((v) => ({
              name: v.name,
              value: v.interaction_count,
            }))}
            label="Visitor interactions"
            color="#14b8a6"
            height={350}
          />
        ) : (
          <EmptyState message="No venue data available." />
        )}
      </div>

      {/* Engagement Summary */}
      {engagement.data && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="heading-small">Engagement at a Glance</h2>
            <InfoTooltip text="buzz_per_event" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 border border-border rounded">
              <div className="text-xs text-muted font-semibold uppercase mb-2">
                Buzz (current month)
              </div>
              <div className="text-2xl font-bold text-accent">
                {engagement.data.buzz_current.toFixed(1)}
              </div>
              <div
                className={`text-xs font-medium ${
                  engagement.data.buzz_change >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {engagement.data.buzz_change > 0 ? "↑" : "↓"}{" "}
                {Math.abs(engagement.data.buzz_change).toFixed(1)}% from last month
              </div>
            </div>
            <div className="text-center p-4 border border-border rounded">
              <div className="text-xs text-muted font-semibold uppercase mb-2">
                Current Month Events
              </div>
              <div className="text-2xl font-bold text-accent">
                {engagement.data.current_month_events}
              </div>
              <div className="text-xs text-muted">
                vs {engagement.data.previous_month_events} last month
              </div>
            </div>
            <div className="text-center p-4 border border-border rounded">
              <div className="text-xs text-muted font-semibold uppercase mb-2">
                Current Month Interactions
              </div>
              <div className="text-2xl font-bold text-accent">
                {engagement.data.current_month_interactions.toLocaleString()}
              </div>
              <div className="text-xs text-muted">
                vs {engagement.data.previous_month_interactions.toLocaleString()} last month
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
