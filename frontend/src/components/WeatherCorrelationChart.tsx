import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface WeatherCorrelationPoint {
  date: string;
  interactions: number;
  tickets: number;
  temp_max_c: number | null;
  precipitation_mm: number | null;
  weather_code: number | null;
}

interface WeatherCorrelationChartProps {
  data: WeatherCorrelationPoint[];
  height?: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: WeatherCorrelationPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-semibold text-fg mb-1">{label}</div>
      <div className="text-blue-600">Interactions: {row.interactions.toLocaleString()}</div>
      {row.tickets > 0 && <div className="text-pink-600">Tickets: {row.tickets.toLocaleString()}</div>}
      {row.temp_max_c != null && <div className="text-orange-600">Max temp: {row.temp_max_c}°C</div>}
      {row.precipitation_mm != null && (
        <div className="text-sky-600">Rain: {row.precipitation_mm}mm</div>
      )}
    </div>
  );
}

/**
 * WeatherCorrelationChart: daily interactions (bars, left axis) vs max
 * temperature (line, right axis), with precipitation surfaced in the
 * tooltip. Days with no backfilled weather row simply have a gap in the
 * temperature line rather than being dropped from the chart.
 */
export function WeatherCorrelationChart({ data, height = 300 }: WeatherCorrelationChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#9ca3af"
          style={{ fontSize: 10 }}
          tick={{ fill: "#6b7280" }}
          minTickGap={24}
        />
        <YAxis
          yAxisId="left"
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke="#9ca3af"
          style={{ fontSize: 12 }}
          tick={{ fill: "#6b7280" }}
          unit="°C"
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="interactions" fill="#3b82f6" name="Interactions" radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="temp_max_c"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          name="Max temp (°C)"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

