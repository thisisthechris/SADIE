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

interface TicketVolumeTrendPoint {
  month: string;
  tickets: number;
  orders: number;
}

interface TicketVolumeTrendLineProps {
  data: TicketVolumeTrendPoint[];
  height?: number;
}

/** Monthly ticket-purchase volume: tickets bought vs number of orders. */
export function TicketVolumeTrendLine({ data, height = 300 }: TicketVolumeTrendLineProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: 12 }} tick={{ fill: "#6b7280" }} />
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
        <Line
          type="monotone"
          dataKey="tickets"
          name="Tickets"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive
          animationDuration={400}
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
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
