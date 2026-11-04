import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { percentOfTotal, valueFormatter } from "../lib/percent";
import type { PartySizeBucket } from "../lib/postcodeAreas";

interface PartySizeBarProps {
  /** Show each bar as a share of the total instead of a raw count. */
  percent?: boolean;
  data: PartySizeBucket[];
  height?: number;
}

const TICKET_LABELS: Record<string, string> = {
  "1": "1 ticket",
  "2": "2 tickets",
  "3": "3 tickets",
  "4": "4 tickets",
  "5+": "5+ tickets",
};

/** Order-preserving bar chart of order counts by ticket quantity (party size). */
export function PartySizeBar({ data, height = 300, percent = false }: PartySizeBarProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const rows = percent ? percentOfTotal(data, ["orders"]) : data;
  const chartData = rows.map((d) => ({ ...d, label: TICKET_LABELS[d.tickets] ?? d.tickets }));

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
          formatter={(value: number) => [valueFormatter(percent)(value), "Orders"]}
        />
        <Bar dataKey="orders" name="Orders" isAnimationActive animationDuration={400} radius={[4, 4, 0, 0]}>
          {chartData.map((d) => (
            <Cell key={d.tickets} fill={d.tickets === "5+" ? "#f59e0b" : "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
