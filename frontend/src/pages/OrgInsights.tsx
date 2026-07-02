import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import { BigStat } from "../components/BigStat";
import { HeadlineAreaChart } from "../components/AreaChart";
import JourneyFlowsMap from "../components/JourneyFlowsMap";
import InfoTooltip from "../components/InfoTooltip";
import { HeadlineResponse } from "../lib/types";

/**
 * OrgInsights: New landing page with organisation-focused insights.
 * Displays:
 * - BigStat cards for headline metrics
 * - AreaChart showing trend over months
 * - JourneyFlowsMap showing common pathways between venues
 */
export const OrgInsights: React.FC = () => {
  const { org } = useFilters();
  const cfg = useConfig();
  const maptilerKey = cfg.data?.maptiler_api_key ?? "";

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

              {/* Average Attendees per Event card */}
              <BigStat
                value={
                  headline.current_period.events_count > 0
                    ? Math.round(headline.current_period.attendees_count / headline.current_period.events_count)
                    : 0
                }
                label="Avg Attendees per Event"
                deltaPercent={
                  headline.current_period.events_count > 0 && headline.previous_period.events_count > 0
                    ? Math.round(
                        ((headline.current_period.attendees_count / headline.current_period.events_count -
                          headline.previous_period.attendees_count / headline.previous_period.events_count) /
                          (headline.previous_period.attendees_count / headline.previous_period.events_count)) *
                          100
                      )
                    : 0
                }
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
                    Common pathways between venues, coloured from blue (earlier) to pink (later) across the period. Thicker lines mean more visitors travelled between those venues.
                  </p>
                </div>
                <JourneyFlowsMap
                  org={org}
                  dateFrom={headline.current_period.period_start}
                  dateTo={headline.current_period.period_end}
                  maptilerKey={maptilerKey}
                  height="400px"
                />
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
