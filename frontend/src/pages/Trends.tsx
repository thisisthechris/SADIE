import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import OrgToggle from "../components/OrgToggle";
import EmptyState, { LoadingState } from "../components/EmptyState";
import { StackedAreaChart } from "../components/StackedAreaChart";
import { WeekdayBars } from "../components/WeekdayBars";
import { RankedBar } from "../components/RankedBar";
import { PeakTimesBar } from "../components/PeakTimesBar";
import { PeakTimesTicketsBar } from "../components/PeakTimesTicketsBar";
import { WeatherCorrelationChart } from "../components/WeatherCorrelationChart";
import { AttendanceFrequencyBar } from "../components/AttendanceFrequencyBar";
import { LeadTimeTrendLine } from "../components/LeadTimeTrendLine";
import { DistrictStackedBar } from "../components/DistrictStackedBar";
import { PartySizeBar } from "../components/PartySizeBar";
import { TicketVolumeTrendLine } from "../components/TicketVolumeTrendLine";
import AnimatedNumber from "../components/AnimatedNumber";
import TrendCard from "../components/TrendCard";
import EngagementAtAGlance from "../components/EngagementAtAGlance";
import type { TicketSummaryResp } from "../lib/postcodeAreas";

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

interface PostcodeSegmentDatum {
  district: string;
  daypart?: string;
  category?: string;
  count: number;
}

interface PostcodeEngagementPoint {
  month: string;
  category: string;
  count: number;
}

interface TicketVolumeTrendPoint {
  month: string;
  tickets: number;
  orders: number;
}

interface PeakTimeTicketData {
  hour: number;
  label: string;
  tickets: number;
}

interface WeatherCorrelationPoint {
  date: string;
  interactions: number;
  tickets: number;
  temp_max_c: number | null;
  precipitation_mm: number | null;
  wind_speed_ms: number | null;
  sunshine_hours: number | null;
  weather_code: number | null;
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

  // Peak Times by Postcode
  const peakTimesByPostcode = useQuery<{
    dayparts: string[];
    districts: string[];
    series: PostcodeSegmentDatum[];
  }>({
    queryKey: ["stats", "peak-times-by-postcode", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/peak-times-by-postcode/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch peak times by postcode");
      return res.json();
    },
  });

  // Event Types by Postcode
  const eventTypesByPostcode = useQuery<{
    categories: string[];
    districts: string[];
    series: PostcodeSegmentDatum[];
  }>({
    queryKey: ["stats", "event-types-by-postcode", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/event-types-by-postcode/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch event types by postcode");
      return res.json();
    },
  });

  // Postcode Engagement Trend (top 5 districts, monthly)
  const postcodeEngagementTrend = useQuery<{ series: PostcodeEngagementPoint[] }>({
    queryKey: ["stats", "postcode-engagement-trend", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/postcode-engagement-trend/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch postcode engagement trend");
      return res.json();
    },
  });

  // Ticket Volume Trend (monthly tickets + orders)
  const ticketVolumeTrend = useQuery<{ series: TicketVolumeTrendPoint[] }>({
    queryKey: ["stats", "ticket-volume-trend", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/ticket-volume-trend/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch ticket volume trend");
      return res.json();
    },
  });

  // Ticket Summary (party-size distribution + top postcodes by ticket volume)
  const ticketSummary = useQuery<TicketSummaryResp>({
    queryKey: ["viz", "postcode-ticket-summary", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/viz/postcode-ticket-summary/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch postcode ticket summary");
      return res.json();
    },
  });

  // Time of Day x Ticket Volume
  const peakTimesTickets = useQuery<{ series: PeakTimeTicketData[]; midnight_excluded_count: number }>({
    queryKey: ["stats", "peak-times-tickets", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/peak-times-tickets/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch peak times tickets");
      return res.json();
    },
  });

  // Weather vs Attendance
  const weatherCorrelation = useQuery<{ series: WeatherCorrelationPoint[] }>({
    queryKey: ["stats", "weather-correlation", org, category, date_from, date_to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/weather-correlation/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch weather correlation");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main mb-2">Trends</h1>
          <p className="body-lg">
            {org
              ? "Key patterns for your organisation. Switch to City Wide to see Plymouth overall."
              : "Key patterns across all organisations in Plymouth."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <OrgToggle />
          {org && (
            <Link to="/insights/compare" className="btn-ghost text-xs border border-border">
              Compare with City →
            </Link>
          )}
        </div>
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

      {/* Time of Day vs Ticket Volume */}
      <TrendCard title="Time of Day vs Ticket Volume" tooltipText="peak_times_tickets">
        {(h) =>
          peakTimesTickets.isLoading ? (
            <LoadingState />
          ) : peakTimesTickets.data?.series?.some((d) => d.tickets > 0) ? (
            <PeakTimesTicketsBar
              data={peakTimesTickets.data.series}
              height={h}
              midnightExcludedCount={peakTimesTickets.data.midnight_excluded_count}
            />
          ) : (
            <EmptyState message="No ticket purchase time-of-day data available." />
          )
        }
      </TrendCard>

      {/* Weather vs Attendance */}
      <TrendCard title="Weather vs Attendance" tooltipText="weather_correlation">
        {(h) =>
          weatherCorrelation.isLoading ? (
            <LoadingState />
          ) : weatherCorrelation.data?.series?.length ? (
            <WeatherCorrelationChart data={weatherCorrelation.data.series} height={h} />
          ) : (
            <EmptyState message="No weather data available — run the backfill_weather management command." />
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
            <EmptyState message="No category data yet. Events need to be tagged with categories — this happens automatically during import when event type fields are populated in your CSV." />
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
                  <AnimatedNumber value={attendanceFrequency.data.summary.gt3_count} />
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
                  <AnimatedNumber value={eventLeadTime.data.overall_avg_days} format={(n) => n.toFixed(1)} /> days
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

      {/* Peak Times by Postcode */}
      <TrendCard title="Peak Times by Postcode" tooltipText="peak_times_by_postcode">
        {(h) =>
          peakTimesByPostcode.isLoading ? (
            <LoadingState />
          ) : peakTimesByPostcode.data?.series?.length ? (
            <DistrictStackedBar
              data={peakTimesByPostcode.data.series.map((d) => ({
                district: d.district,
                segment: d.daypart!,
                count: d.count,
              }))}
              districts={peakTimesByPostcode.data.districts}
              segments={peakTimesByPostcode.data.dayparts}
              height={h}
            />
          ) : (
            <EmptyState message="No postcode interaction-time data available." />
          )
        }
      </TrendCard>

      {/* Event Types by Postcode */}
      <TrendCard title="Event Types by Postcode" tooltipText="event_types_by_postcode">
        {(h) =>
          eventTypesByPostcode.isLoading ? (
            <LoadingState />
          ) : eventTypesByPostcode.data?.series?.length ? (
            <DistrictStackedBar
              data={eventTypesByPostcode.data.series.map((d) => ({
                district: d.district,
                segment: d.category!,
                count: d.count,
              }))}
              districts={eventTypesByPostcode.data.districts}
              segments={eventTypesByPostcode.data.categories}
              height={h}
            />
          ) : (
            <EmptyState message="No postcode category data yet. Events need to be tagged with categories during import for this chart to populate." />
          )
        }
      </TrendCard>

      {/* Postcode Engagement Trend */}
      <TrendCard title="Postcode Engagement Trend" tooltipText="postcode_engagement_trend">
        {(h) =>
          postcodeEngagementTrend.isLoading ? (
            <LoadingState />
          ) : postcodeEngagementTrend.data?.series?.length ? (
            <StackedAreaChart data={postcodeEngagementTrend.data.series} height={h} />
          ) : (
            <EmptyState message="No postcode engagement trend data available." />
          )
        }
      </TrendCard>

      {/* Ticket Volume Trend */}
      <TrendCard title="Ticket Volume Trend" tooltipText="ticket_volume_trend">
        {(h) =>
          ticketVolumeTrend.isLoading ? (
            <LoadingState />
          ) : ticketVolumeTrend.data?.series?.length ? (
            <TicketVolumeTrendLine data={ticketVolumeTrend.data.series} height={h} />
          ) : (
            <EmptyState message="No ticket purchase data available for the selected period." />
          )
        }
      </TrendCard>

      {/* Party Size Distribution */}
      <TrendCard title="Party Size Distribution" tooltipText="party_size_distribution">
        {(h) =>
          ticketSummary.isLoading ? (
            <LoadingState />
          ) : ticketSummary.data?.party_size_distribution?.some((d) => d.orders > 0) ? (
            <div>
              <div className="mb-4 text-center">
                <div className="text-2xl font-bold text-accent">
                  <AnimatedNumber value={ticketSummary.data.avg_party_size ?? 0} format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })} /> tickets/order
                  <span className="text-sm font-normal text-muted ml-2">
                    average party size
                  </span>
                </div>
              </div>
              <PartySizeBar data={ticketSummary.data.party_size_distribution} height={h} />
            </div>
          ) : (
            <EmptyState message="No ticket purchase data available." />
          )
        }
      </TrendCard>

      {/* Top Postcodes by Ticket Volume */}
      <TrendCard title="Top Postcodes by Ticket Volume" tooltipText="top_postcodes_tickets">
        {(h) =>
          ticketSummary.isLoading ? (
            <LoadingState />
          ) : ticketSummary.data?.top_postcodes?.length ? (
            <RankedBar
              data={ticketSummary.data.top_postcodes.map((p) => ({
                name: p.code,
                value: p.total_tickets,
              }))}
              label="Tickets purchased"
              color="#ec4899"
              height={h}
            />
          ) : (
            <EmptyState message="No ticket purchase data available." />
          )
        }
      </TrendCard>

      {/* Engagement Summary */}
      <EngagementAtAGlance />
    </div>
  );
}

