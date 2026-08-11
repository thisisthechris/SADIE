import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PeakTimesTicketsData {
  hour: number;
  label: string;
  tickets: number;
}

interface PeakTimesTicketsBarProps {
  data: PeakTimesTicketsData[];
  height?: number;
  midnightExcludedCount?: number;
}

/**
 * PeakTimesTicketsBar: ticket volume by hour-of-day (via the linked event's
 * start time). Events without a recorded start time (stored as 00:00) are
 * excluded to avoid a misleading spike at midnight.
 */
export function PeakTimesTicketsBar({ data, height = 300, midnightExcludedCount = 0 }: PeakTimesTicketsBarProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div>
      {midnightExcludedCount > 0 && (
        <p className="text-xs text-muted mb-3">
          {midnightExcludedCount.toLocaleString()} ticket{midnightExcludedCount === 1 ? "" : "s"} linked to events with no recorded start time (stored as midnight) have been excluded from this chart.
        </p>
      )}
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          stroke="#9ca3af"
          style={{ fontSize: 11 }}
          tick={{ fill: "#6b7280" }}
          interval={1}
        />
        <YAxis stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          formatter={(value: number) => value.toLocaleString()}
        />
        <Bar dataKey="tickets" fill="#ec4899" name="Tickets purchased" isAnimationActive animationDuration={400} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
