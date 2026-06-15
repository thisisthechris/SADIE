import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const POSTCODES = [
  "PL1", "PL2", "PL3", "PL4", "PL5", "PL6", "PL7", "PL8", "PL9", "PL10",
  "PL11", "PL12", "PL13", "PL14", "PL15", "PL16", "PL17", "PL18", "PL19", "PL20", "PL21",
];

type RecResult = {
  id: number;
  title: string;
  start_datetime: string | null;
  organisation: { id: number; name: string };
  distance_km?: number;
};

export default function RecommendationsWidget() {
  const [postcode, setPostcode] = useState("PL1");
  const [km, setKm] = useState(5);

  const q = useQuery({
    queryKey: ["rec-near", postcode, km],
    queryFn: () =>
      api<{ results: RecResult[] }>("/api/analytics/recommendations/near/", {
        query: { postcode, km, limit: 10 },
      }),
  });

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="heading-sub">Events near you</h3>
      </div>
      <div className="flex items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Postcode</span>
          <select className="input" value={postcode} onChange={(e) => setPostcode(e.target.value)}>
            {POSTCODES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            Within {km} km
          </span>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
          />
        </label>
      </div>
      {q.isLoading && <p className="text-xs text-muted">Loading…</p>}
      {q.data && (
        <ul className="divide-y divide-border text-xs">
          {q.data.results.length === 0 && (
            <li className="py-2 text-muted">No upcoming events nearby.</li>
          )}
          {q.data.results.map((e) => (
            <li key={e.id} className="py-2">
              <Link to={`/insights/events/${e.id}`} className="font-medium truncate block hover:text-accent">
                {e.title}
              </Link>
              <div className="text-muted truncate">
                {e.organisation.name}
                {e.start_datetime && ` · ${new Date(e.start_datetime).toLocaleDateString()}`}
                {e.distance_km != null && ` · ${e.distance_km.toFixed(1)} km`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
