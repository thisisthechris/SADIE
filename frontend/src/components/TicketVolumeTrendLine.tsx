import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useLegendToggle } from "../lib/useLegendToggle";
import { bucketLabel, useFilters } from "../lib/filters";

interface TicketVolumeTrendPoint {
  month: string;
  tickets: number;
  orders: number;
}

interface TicketVolumeTrendLineProps {
  data: TicketVolumeTrendPoint[];
  height?: number;
}

/** Ticket-purchase volume per week/month/quarter: tickets bought vs number of orders. */
export function TicketVolumeTrendLine({ data, height = 300 }: TicketVolumeTrendLineProps) {
  const { isHidden, onLegendClick, legendFormatter } = useLegendToggle();
  const { bucket } = useFilters();

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="month"
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
          tickFormatter={(v: string) => bucketLabel(v, bucket)}
          minTickGap={24}
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
          labelFormatter={(v: string) => bucketLabel(v, bucket)}
          formatter={(value: number) => value.toLocaleString()}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16, fontSize: 12, cursor: "pointer" }}
          onClick={onLegendClick}
          formatter={legendFormatter}
        />
        <Line
          type="monotone"
          dataKey="tickets"
          name="Tickets"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive
          animationDuration={400}
          hide={isHidden("tickets")}
        />
        <Line
          type="monotone"
          dataKey="orders"
          name="Orders"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive
          animationDuration={400}
          hide={isHidden("orders")}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
