import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DataPoint {
  month: string;
  category: string;
  count: number;
}

interface ChartDataItem {
  month: string;
  [key: string]: string | number;
}

interface StackedAreaChartProps {
  data: DataPoint[];
  height?: number;
}

// Color palette for categories
const COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ef4444", // red
  "#10b981", // emerald
];

export function StackedAreaChart({
  data,
  height = 300,
}: StackedAreaChartProps) {
  // Transform flat series into grouped by month
  const chartData = useMemo(() => {
    const monthMap = new Map<string, ChartDataItem>();

    for (const item of data) {
      if (!monthMap.has(item.month)) {
        monthMap.set(item.month, { month: item.month });
      }
      const row = monthMap.get(item.month)!;
      row[item.category] = ((row[item.category] as number) ?? 0) + item.count;
    }

    return Array.from(monthMap.values()).sort((a, b) => {
      const aMonth = String(a.month);
      const bMonth = String(b.month);
      return aMonth.localeCompare(bMonth);
    });
  }, [data]);

  // Extract unique categories and assign colors
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of data) {
      cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [data]);

  if (!chartData || chartData.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData}>
        <defs>
          {categories.map((cat, i) => (
            <linearGradient id={`grad-${i}`} key={cat} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
              <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="month"
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
        <Legend
          wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
          iconType="line"
        />
        {categories.map((cat, i) => (
          <Area
            key={cat}
            type="monotone"
            dataKey={cat}
            stackId="a"
            stroke={COLORS[i % COLORS.length]}
            fill={`url(#grad-${i})`}
            isAnimationActive
            animationDuration={400}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
