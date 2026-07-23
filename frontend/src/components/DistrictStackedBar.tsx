import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DistrictSegmentDatum {
  district: string;
  segment: string;
  count: number;
}

interface ChartRow {
  district: string;
  [key: string]: string | number;
}

interface DistrictStackedBarProps {
  data: DistrictSegmentDatum[];
  /** Fixed district ordering (e.g. server-ranked by volume). Falls back to data order. */
  districts?: string[];
  /** Fixed segment ordering (e.g. dayparts in chronological order). Falls back to sorted unique segments. */
  segments?: string[];
  height?: number;
}

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

/**
 * DistrictStackedBar: generic stacked bar chart with a postcode district on
 * the x-axis and an arbitrary categorical breakdown (segment) stacked within
 * each bar. Shared by "Peak Times by Postcode" (segment = daypart) and
 * "Event Types by Postcode" (segment = category).
 */
export function DistrictStackedBar({
  data,
  districts,
  segments,
  height = 300,
}: DistrictStackedBarProps) {
  const chartData = useMemo(() => {
    const map = new Map<string, ChartRow>();
    for (const item of data) {
      if (!map.has(item.district)) {
        map.set(item.district, { district: item.district });
      }
      const row = map.get(item.district)!;
      row[item.segment] = ((row[item.segment] as number) ?? 0) + item.count;
    }
    if (districts && districts.length) {
      return districts.filter((d) => map.has(d)).map((d) => map.get(d)!);
    }
    return Array.from(map.values());
  }, [data, districts]);

  const segmentKeys = useMemo(() => {
    if (segments && segments.length) return segments;
    const set = new Set<string>();
    for (const item of data) set.add(item.segment);
    return Array.from(set).sort();
  }, [data, segments]);

  if (!chartData.length) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="district" stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
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
        <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
        {segmentKeys.map((seg, i) => (
          <Bar
            key={seg}
            dataKey={seg}
            stackId="a"
            fill={COLORS[i % COLORS.length]}
            name={seg}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
