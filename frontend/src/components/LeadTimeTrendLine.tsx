import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface LeadTimeTrendPoint {
  month: string;
  avg_days: number;
}

interface LeadTimeTrendLineProps {
  data: LeadTimeTrendPoint[];
  height?: number;
}

export function LeadTimeTrendLine({ data, height = 300 }: LeadTimeTrendLineProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
        <YAxis stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          formatter={(value: number) => [`${value.toFixed(1)} days`, "Avg lead time"]}
        />
        <Line
          type="monotone"
          dataKey="avg_days"
          name="Avg lead time (days)"
          stroke="#14b8a6"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive
          animationDuration={400}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
