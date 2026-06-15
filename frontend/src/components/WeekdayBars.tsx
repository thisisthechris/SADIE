import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface WeekdayData {
  weekday: number;
  weekday_name: string;
  events: number;
  interactions: number;
}

interface WeekdayBarsProps {
  data: WeekdayData[];
  height?: number;
}

export function WeekdayBars({ data, height = 300 }: WeekdayBarsProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="weekday_name"
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
        />
        <YAxis stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
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
        <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
        <Bar dataKey="events" fill="#6366f1" name="Events" isAnimationActive={false} />
        <Bar dataKey="interactions" fill="#ec4899" name="Visitor interactions" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
