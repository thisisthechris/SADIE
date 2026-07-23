import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { HeadlineResponse } from "../lib/types";

interface AreaChartProps {
  /** The current org filter (org ID or empty for city-wide) */
  orgId?: string | number | null;
  /** Optional CSS classes */
  className?: string;
}

/**
 * AreaChart: Visualizes headline metrics (events) over current and previous month.
 * Fetches from /api/analytics/stats/headline/ and renders a responsive area chart.
 */
export const HeadlineAreaChart: React.FC<AreaChartProps> = ({
  orgId,
  className = "",
}) => {
  // Build query params
  const params = new URLSearchParams();
  if (orgId) {
    params.append("org", String(orgId));
  }

  // Fetch headline data
  const { data, isLoading, error } = useQuery<HeadlineResponse>({
    queryKey: ["stats", "headline", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/headline/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch headline stats");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center h-96`}>
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${className} flex items-center justify-center h-96`}>
        <div className="text-red-600">Error loading chart data</div>
      </div>
    );
  }

  // Transform data for chart: two data points (prev month, current month)
  const chartData = [
    {
      period: data.previous_period.period_start.slice(5, 10), // MM-DD
      events: data.previous_period.events_count,
      attendees: data.previous_period.attendees_count,
    },
    {
      period: data.current_period.period_start.slice(5, 10),
      events: data.current_period.events_count,
      attendees: data.current_period.attendees_count,
    },
  ];

  return (
    <div className={`card p-6 ${className}`}>
      <h3 className="heading-sub mb-4">
        Events & Attendees Trend
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorAttendees" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="events"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#colorEvents)"
            name="Events"
          />
          <Area
            type="monotone"
            dataKey="attendees"
            stroke="#10b981"
            fillOpacity={1}
            fill="url(#colorAttendees)"
            name="Attendees"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
