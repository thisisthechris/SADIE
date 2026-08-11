import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import { BigStat } from "../components/BigStat";
import { HeadlineAreaChart } from "../components/AreaChart";
import JourneyFlowsMap from "../components/JourneyFlowsMap";
import EngagementAtAGlance from "../components/EngagementAtAGlance";
import InfoTooltip from "../components/InfoTooltip";
import OrgToggle from "../components/OrgToggle";
import { LoadingState } from "../components/EmptyState";
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main mb-2">Insights</h1>
          <p className="body-lg">
            See how many people are attending events and where they're coming from.
          </p>
        </div>
        <OrgToggle />
      </div>

      {isLoading ? (
        <LoadingState variant="chart" height={200} />
      ) : headline ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <HeadlineAreaChart orgId={org} />

          {/* Month + Quarter attendance/events deltas */}
          <EngagementAtAGlance />

          {/* Postcode Map */}
          <div className="card p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="heading-small">Where visitors come from</h2>
                <InfoTooltip text="postcode_area" />
              </div>
              <p className="text-sm text-muted mb-4">
                Top 5 most common pathways between venues during this period, coloured from blue (earlier) to pink (later). Thicker lines mean more visitors travelled between those venues.
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
        </>
      ) : (
        <p className="text-red-600 text-center py-12">Error loading data</p>
      )}
    </div>
  );
};

