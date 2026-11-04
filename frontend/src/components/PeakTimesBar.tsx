import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { percentOfTotal, valueFormatter } from "../lib/percent";

interface PeakTimeData {
  hour: number;
  label: string;
  events: number;
}

interface PeakTimesBarProps {
  data: PeakTimeData[];
  height?: number;
  /** Show each bar as a share of the total instead of a raw count. */
  percent?: boolean;
}

export function PeakTimesBar({ data, height = 300, percent = false }: PeakTimesBarProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const rows = percent ? percentOfTotal(data, ["events"]) : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          stroke="#9ca3af"
          style={{ fontSize: 11 }}
          tick={{ fill: "#6b7280" }}
          interval={1}
        />
        <YAxis stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }}
          allowDecimals={percent}
          tickFormatter={valueFormatter(percent)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          formatter={(value: number) => valueFormatter(percent)(value)}
        />
        <Bar dataKey="events" fill="#8b5cf6" name="Events starting" isAnimationActive animationDuration={400} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
