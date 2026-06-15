import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface RankedItem {
  name: string;
  value: number;
}

interface RankedBarProps {
  data: RankedItem[];
  height?: number;
  label?: string;
  color?: string;
}

export function RankedBar({
  data,
  height = 300,
  label = "Count",
  color = "#6366f1",
}: RankedBarProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Sort descending and limit to top 15
  const sorted = data.sort((a, b) => b.value - a.value).slice(0, 15);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
        <YAxis
          dataKey="name"
          type="category"
          stroke="#9ca3af"
          style={{ fontSize: 11 }}
          tick={{ fill: "#6b7280" }}
          width={190}
        />
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
        <Bar dataKey="value" fill={color} name={label} isAnimationActive={false} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
