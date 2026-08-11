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
} from "recharts";

interface MonthlyPoint {
  month: string; // YYYY-MM
  count: number;
}

interface TimeseriesResp {
  series: MonthlyPoint[];
}

interface AreaChartProps {
  /** The current org filter (org ID or empty for city-wide) */
  orgId?: string | number | null;
  /** Optional CSS classes */
  className?: string;
}

/** Format a "YYYY-MM" string as UK short month label, e.g. "Jan 2025". */
function ukMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/**
 * HeadlineAreaChart: Monthly visitor interaction trend over the full data range.
 * Uses the interactions-timeseries endpoint so the chart spans all available
 * months rather than just the last two. Dates are formatted in UK style (e.g.
 * "Jan 2025").
 */
export const HeadlineAreaChart: React.FC<AreaChartProps> = ({
  orgId,
  className = "",
}) => {
  const params = new URLSearchParams();
  if (orgId) params.append("org", String(orgId));

  const { data, isLoading, error } = useQuery<TimeseriesResp>({
    queryKey: ["stats", "interactions-timeseries", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/interactions-timeseries/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch interaction timeseries");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center h-48`}>
        <div className="text-muted text-sm">Loading chart…</div>
      </div>
    );
  }

  if (error || !data?.series?.length) {
    return (
      <div className={`${className} flex items-center justify-center h-48`}>
        <div className="text-muted text-sm">No trend data available yet.</div>
      </div>
    );
  }

  const chartData = data.series.map((p) => ({
    period: ukMonthLabel(p.month),
    interactions: p.count,
  }));

  return (
    <div className={`card p-6 ${className}`}>
      <h3 className="heading-sub mb-4">Visitor Interactions by Month</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorInteractions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#001FCC" stopOpacity={0.7} />
              <stop offset="95%" stopColor="#001FCC" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="period"
            stroke="#9ca3af"
            style={{ fontSize: 11 }}
            tick={{ fill: "#6b7280" }}
            minTickGap={40}
          />
          <YAxis
            stroke="#9ca3af"
            style={{ fontSize: 12 }}
            tick={{ fill: "#6b7280" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}
            labelStyle={{ color: "#1f2937", fontWeight: 600 }}
            formatter={(value: number) => [value.toLocaleString(), "Interactions"]}
          />
          <Area
            type="monotone"
            dataKey="interactions"
            stroke="#001FCC"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorInteractions)"
            name="Interactions"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
