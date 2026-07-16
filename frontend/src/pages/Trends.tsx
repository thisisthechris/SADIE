import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import InfoTooltip from "../components/InfoTooltip";
import OrgToggle from "../components/OrgToggle";
import EmptyState, { LoadingState } from "../components/EmptyState";
import { StackedAreaChart } from "../components/StackedAreaChart";
import { WeekdayBars } from "../components/WeekdayBars";
import { RankedBar } from "../components/RankedBar";
import { PeakTimesBar } from "../components/PeakTimesBar";
import { AttendanceFrequencyBar } from "../components/AttendanceFrequencyBar";
import { LeadTimeTrendLine } from "../components/LeadTimeTrendLine";
import TrendCard from "../components/TrendCard";

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

interface PeakTimeData {
  hour: number;
  label: string;
  events: number;
}

interface AttendanceBucket {
  bucket: string;
  visitors: number;
}

interface AttendanceSummary {
  total_visitors: number;
  gt3_count: number;
  gt3_pct: number;
}

interface LeadTimeByOrg {
  organisation_id: number;
  organisation__name: string;
  avg_days: number;
  event_count: number;
}

interface LeadTimeTrendPoint {
  month: string;
  avg_days: number;
}

/**
 * Trends: Multi-section dashboard showing key trends across event and
 * visitor activity. Every chart card can be expanded to fullscreen via
 * TrendCard's expand toggle.
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

  // Peak Times of Day
  const peakTimes = useQuery<{ series: PeakTimeData[] }>({
    queryKey: ["stats", "peak-times", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/peak-times/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch peak times");
      return res.json();
    },
  });

  // Attendance Frequency
  const attendanceFrequency = useQuery<{
    series: AttendanceBucket[];
    summary: AttendanceSummary;
  }>({
    queryKey: ["stats", "attendance-frequency", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/attendance-frequency/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch attendance frequency");
      return res.json();
    },
  });

  // Event Lead Time (scrape-to-event) by org
  const eventLeadTime = useQuery<{
    overall_avg_days: number;
    excluded_count: number;
    by_org: LeadTimeByOrg[];
  }>({
    queryKey: ["stats", "event-lead-time", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/event-lead-time/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch event lead time");
      return res.json();
    },
  });

  // Lead Time Trend (monthly)
  const leadTimeTrend = useQuery<{ series: LeadTimeTrendPoint[] }>({
    queryKey: ["stats", "lead-time-trend", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/lead-time-trend/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch lead time trend");
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
      <TrendCard title="New vs Returning Visitors" tooltipText="new_vs_returning">
        {(h) =>
          newReturning.isLoading ? (
            <LoadingState />
          ) : newReturning.data?.series?.length ? (
            <StackedAreaChart
              data={newReturning.data.series.map((d) => [
                { month: d.month, category: "New", count: d.new },
                { month: d.month, category: "Returning", count: d.returning },
              ]).flat()}
              height={h}
            />
          ) : (
            <EmptyState message="No visitor data available for the selected period." />
          )
        }
      </TrendCard>

      {/* Weekday Activity */}
      <TrendCard title="Activity by Day of Week" tooltipText="weekday_activity">
        {(h) =>
          weekdayActivity.isLoading ? (
            <LoadingState />
          ) : weekdayActivity.data?.series?.length ? (
            <WeekdayBars data={weekdayActivity.data.series} height={h} />
          ) : (
            <EmptyState message="No activity data available." />
          )
        }
      </TrendCard>

      {/* Peak Times of Day */}
      <TrendCard title="Peak Times of Day" tooltipText="peak_times">
        {(h) =>
          peakTimes.isLoading ? (
            <LoadingState />
          ) : peakTimes.data?.series?.some((d) => d.events > 0) ? (
            <PeakTimesBar data={peakTimes.data.series} height={h} />
          ) : (
            <EmptyState message="No event start-time data available." />
          )
        }
      </TrendCard>

      {/* Category Trends */}
      <TrendCard title="Category Trends Over Time" tooltipText="category_trends">
        {(h) =>
          categoryTrends.isLoading ? (
            <LoadingState />
          ) : categoryTrends.data?.series?.length ? (
            <StackedAreaChart data={categoryTrends.data.series} height={h} />
          ) : (
            <EmptyState message="No category data available." />
          )
        }
      </TrendCard>

      {/* Top Venues */}
      <TrendCard title="Top Venues by Activity" tooltipText="venue_popularity">
        {(h) =>
          topVenues.isLoading ? (
            <LoadingState />
          ) : topVenues.data?.results?.length ? (
            <RankedBar
              data={topVenues.data.results.map((v) => ({
                name: v.name,
                value: v.interaction_count,
              }))}
              label="Visitor interactions"
              color="#14b8a6"
              height={h}
            />
          ) : (
            <EmptyState message="No venue data available." />
          )
        }
      </TrendCard>

      {/* Attendance Frequency */}
      <TrendCard title="Attendance Frequency" tooltipText="attendance_frequency">
        {(h) =>
          attendanceFrequency.isLoading ? (
            <LoadingState />
          ) : attendanceFrequency.data?.series?.some((d) => d.visitors > 0) ? (
            <div>
              <div className="mb-4 text-center">
                <div className="text-2xl font-bold text-accent">
                  {attendanceFrequency.data.summary.gt3_count.toLocaleString()}
                  <span className="text-sm font-normal text-muted ml-2">
                    ({attendanceFrequency.data.summary.gt3_pct}%) of visitors attended more than 3 events
                  </span>
                </div>
              </div>
              <AttendanceFrequencyBar data={attendanceFrequency.data.series} height={h} />
            </div>
          ) : (
            <EmptyState message="No attendance data available." />
          )
        }
      </TrendCard>

      {/* Event Lead Time by Org */}
      <TrendCard title="Event Lead Time by Organisation" tooltipText="event_lead_time">
        {(h) =>
          eventLeadTime.isLoading ? (
            <LoadingState />
          ) : eventLeadTime.data?.by_org?.length ? (
            <div>
              <div className="mb-4 text-center">
                <div className="text-2xl font-bold text-accent">
                  {eventLeadTime.data.overall_avg_days.toFixed(1)} days
                  <span className="text-sm font-normal text-muted ml-2">
                    average time from listing to event
                  </span>
                </div>
                {eventLeadTime.data.excluded_count > 0 && (
                  <div className="text-xs text-muted mt-1">
                    {eventLeadTime.data.excluded_count} backdated listing
                    {eventLeadTime.data.excluded_count !== 1 ? "s" : ""} excluded
                  </div>
                )}
              </div>
              <RankedBar
                data={eventLeadTime.data.by_org.map((o) => ({
                  name: o.organisation__name,
                  value: o.avg_days,
                }))}
                label="Avg days from listing to event"
                color="#f59e0b"
                height={h}
              />
            </div>
          ) : (
            <EmptyState message="No lead time data available." />
          )
        }
      </TrendCard>

      {/* Lead Time Trend */}
      <TrendCard title="Lead Time Trend" tooltipText="lead_time_trend">
        {(h) =>
          leadTimeTrend.isLoading ? (
            <LoadingState />
          ) : leadTimeTrend.data?.series?.length ? (
            <LeadTimeTrendLine data={leadTimeTrend.data.series} height={h} />
          ) : (
            <EmptyState message="No lead time trend data available." />
          )
        }
      </TrendCard>

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

