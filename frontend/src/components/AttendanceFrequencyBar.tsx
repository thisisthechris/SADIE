import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { percentOfTotal, valueFormatter } from "../lib/percent";

interface AttendanceBucket {
  bucket: string;
  visitors: number;
}

interface AttendanceFrequencyBarProps {
  /** Show each bar as a share of the total instead of a raw count. */
  percent?: boolean;
  data: AttendanceBucket[];
  height?: number;
}

const BUCKET_LABELS: Record<string, string> = {
  "1": "1 event",
  "2": "2 events",
  "3": "3 events",
  "4+": "4+ events",
};

export function AttendanceFrequencyBar({ data, height = 300, percent = false }: AttendanceFrequencyBarProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const rows = percent ? percentOfTotal(data, ["visitors"]) : data;
  const chartData = rows.map((d) => ({ ...d, label: BUCKET_LABELS[d.bucket] ?? d.bucket }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
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
          formatter={(value: number) => [valueFormatter(percent)(value), "Visitors"]}
        />
        <Bar dataKey="visitors" name="Visitors" isAnimationActive animationDuration={400} radius={[4, 4, 0, 0]}>
          {chartData.map((d) => (
            <Cell key={d.bucket} fill={d.bucket === "4+" ? "#f59e0b" : "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
