import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import { api } from "../lib/api";
import { BigStat } from "../components/BigStat";
import { HeadlineAreaChart } from "../components/AreaChart";
import Map2D, { type MapPoint, type HeatmapPoint } from "../viz/Map2D";
import InfoTooltip from "../components/InfoTooltip";
import { HeadlineResponse } from "../lib/types";

interface Point {
  postcode: string;
  lng: number;
  lat: number;
  total: number;
}

interface PointsResp {
  count: number;
  results: Point[];
}

interface HeatData {
  lng: number;
  lat: number;
  total: number;
  postcode_count: number;
  postcodes: string[];
}

interface HeatResp {
  count: number;
  clustering: {
    radius_meters: number;
    min_postcodes: number;
    min_interactions: number;
  };
  results: HeatData[];
}

/**
 * OrgInsights: New landing page with organisation-focused insights.
 * Displays:
 * - BigStat cards for headline metrics
 * - AreaChart showing trend over months
 * - Map2D with bubble visualization showing postcode distribution
 */
export const OrgInsights: React.FC = () => {
  const { org } = useFilters();
  const cfg = useConfig();
  const maptilerKey = cfg.data?.maptiler_api_key ?? "";
  const [showPoints, setShowPoints] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(true);

  // Fetch headline stats
  const params = new URLSearchParams();
  if (org) params.append("org", String(org));

  const { data: headline, isLoading } = useQuery<HeadlineResponse>({
    queryKey: ["stats", "headline", org],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/headline/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch headline stats");
      return res.json();
    },
  });

  // Fetch postcode points for exact locations
  const pointsQuery = useQuery({
    queryKey: ["viz-postcode-points", org],
    queryFn: () => {
      const q = org ? { org: String(org) } : {};
      return api<PointsResp>("/api/analytics/viz/postcode-points/", { query: q });
    },
  });

  // Fetch heatmap data for privacy-clustered bubbles
  const heatmapQuery = useQuery({
    queryKey: ["viz-postcode-heat", org],
    queryFn: () => {
      const q = org ? { org: String(org) } : {};
      return api<HeatResp>("/api/analytics/viz/postcode-heat/", { query: q });
    },
  });

  // Transform points into MapPoint format
  const mapPoints: MapPoint[] = useMemo(() => {
    const max = Math.max(1, ...(pointsQuery.data?.results ?? []).map((p) => p.total));
    return (pointsQuery.data?.results ?? []).map((p) => ({
      id: p.postcode,
      lng: p.lng,
      lat: p.lat,
      weight: Math.round((p.total / max) * 100),
      color: "#20c997",
      popupHtml: `<div class="text-sm"><div class="font-medium">${p.postcode}</div><div>${p.total.toLocaleString()} interactions</div></div>`,
    }));
  }, [pointsQuery.data]);

  // Transform heatmap into HeatmapPoint format
  const heatmapPoints: HeatmapPoint[] = useMemo(() => {
    return (heatmapQuery.data?.results ?? []).map((h) => ({
      lng: h.lng,
      lat: h.lat,
      total: h.total,
      postcode_count: h.postcode_count,
    }));
  }, [heatmapQuery.data]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="heading-main mb-2">Insights</h1>
          <p className="body-lg">
            See how many people are attending events and where they're coming from.
          </p>
        </div>

        {/* Headline Stats - Two columns on desktop, one on mobile */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-500">Loading metrics...</div>
          </div>
        ) : headline ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Events card */}
              <BigStat
                value={headline.current_period.events_count}
                label="Events"
                deltaPercent={headline.deltas.events_pct_change}
              />

              {/* Attendees card */}
              <BigStat
                value={headline.current_period.attendees_count}
                label="Unique Attendees"
                deltaPercent={headline.deltas.attendees_pct_change}
              />
            </div>

            {/* Area Chart */}
            <div className="mb-8">
              <HeadlineAreaChart orgId={org} />
            </div>

            {/* Postcode Map */}
            <div className="mb-8">
              <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="heading-small">Where visitors come from</h2>
                    <InfoTooltip text="postcode_area" />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Larger bubbles show areas with more event visits. Exact postcodes are shown as pins; small areas are grouped together to protect privacy.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setShowPoints(!showPoints)}
                      className={`px-3 py-1 text-xs rounded font-medium transition ${
                        showPoints
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Pins
                    </button>
                    <button
                      onClick={() => setShowClusters(!showClusters)}
                      className={`px-3 py-1 text-xs rounded font-medium transition ${
                        showClusters
                          ? "bg-sky-500 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Bubbles
                    </button>
                    <button
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      className={`px-3 py-1 text-xs rounded font-medium transition ${
                        showHeatmap
                          ? "bg-red-500 text-white"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Heat
                    </button>
                  </div>
                </div>
                {pointsQuery.isLoading || heatmapQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="text-gray-500">Loading map...</div>
                  </div>
                ) : (
                  <Map2D
                    points={mapPoints}
                    heatmapPoints={heatmapPoints}
                    maptilerKey={maptilerKey}
                    height="400px"
                    defaultColor="#20c997"
                    showPoints={showPoints}
                    showHeatmap={showHeatmap}
                    showClusters={showClusters}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-center py-12">
            <div className="text-red-500">Error loading data</div>
          </div>
        )}
      </div>
    </div>
  );
};
