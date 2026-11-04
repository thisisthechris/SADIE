import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { percentOfTotal, valueFormatter } from "../lib/percent";
import { useLegendToggle } from "../lib/useLegendToggle";

interface WeekdayData {
  weekday: number;
  weekday_name: string;
  events: number;
  interactions: number;
}

interface WeekdayBarsProps {
  data: WeekdayData[];
  height?: number;
  /** Show each bar as a share of the total instead of a raw count. */
  percent?: boolean;
}

export function WeekdayBars({ data, height = 300, percent = false }: WeekdayBarsProps) {
  const { isHidden, onLegendClick, legendFormatter } = useLegendToggle();

  if (!data || data.length === 0) {
    return null;
  }

  const rows = percent ? percentOfTotal(data, ["events", "interactions"]) : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="weekday_name"
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
        />
        <YAxis
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
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
        <Legend
          wrapperStyle={{ paddingTop: 16, fontSize: 12, cursor: "pointer" }}
          onClick={onLegendClick}
          formatter={legendFormatter}
        />
        <Bar dataKey="events" fill="#6366f1" name="Events" isAnimationActive animationDuration={400} hide={isHidden("events")} />
        <Bar dataKey="interactions" fill="#ec4899" name="Visitor interactions" isAnimationActive animationDuration={400} hide={isHidden("interactions")} />
      </BarChart>
    </ResponsiveContainer>
  );
}
