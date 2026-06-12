import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { BigStat } from "../components/BigStat";
import { HeadlineAreaChart } from "../components/AreaChart";
import { ChoroplethMap } from "../components/ChoroplethMap";
import { HeadlineResponse } from "../lib/types";

/**
 * OrgInsights: New landing page with organisation-focused insights.
 * Displays:
 * - BigStat cards for headline metrics
 * - AreaChart showing trend over months
 * - ChoroplethMap showing postcode distribution
 */
export const OrgInsights: React.FC = () => {
  const { org } = useFilters();

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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="heading-main mb-2">Insights</h1>
          <p className="body-lg">
            Explore events and attendance patterns in Plymouth
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

            {/* Choropleth Map */}
            <div className="mb-8">
              <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h2 className="heading-small mb-4">
                  Distribution by Postcode
                </h2>
                <ChoroplethMap />
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
