/**
 * Editable wording for the data hub.
 *
 * All plain-English descriptions of sections, maps, and data scope live here so
 * they can be changed without touching components. Glossary definitions live in
 * glossary.ts.
 */

export const SITE_NAME = "SADIE";

export const LANDING = {
  tagline: "A place-based data hub for Plymouth's ticketed cultural events.",
  intro:
    "SADIE brings together ticketed event data from partner arts and cultural organisations across Plymouth. It's published as a weekly report: every Monday it updates to cover the week that ended the day before, so partners can plan together and see their collective reach.",
  scopeNote:
    "Figures cover ticketed events only and count intended attendance (headcount), not tickets sold. CRM records without ticket data are excluded from ticket metrics.",
  partnersHeading: "Partners contributing data",
  partnersEmpty: "Partner organisations will appear here once they are added.",
  sectionsHeading: "What you can explore",
};

export interface SectionCopy {
  title: string;
  description: string;
}

export const SECTIONS: Record<"insights" | "maps" | "analysis" | "exploration" | "help", SectionCopy> = {
  insights: {
    title: "Insights",
    description:
      "The weekly report: attendance, events and visitors for the latest week, compared with the week before.",
  },
  maps: {
    title: "Maps",
    description:
      "Where events and venues are across Plymouth. Use these to see the geography of the city's cultural activity.",
  },
  analysis: {
    title: "Analysis",
    description:
      "Trends by week, month or quarter, comparisons between periods or partners, and how events are categorised.",
  },
  exploration: {
    title: "Exploration",
    description:
      "How visitors move between venues and postcode areas, and how partners connect through shared audiences.",
  },
  help: {
    title: "Help",
    description: "Definitions of the terms used across the data hub.",
  },
};

export const MAPS = {
  venues: "Shows each venue that hosted ticketed events in the selected period.",
  events: "Shows where ticketed events took place in the selected period.",
  postcodePathways:
    "Shows the postcode sectors that visitors came from and the venues they went to.",
  journeyMap:
    "Shows the most common pathways between venues. Each line is a route that visitors took between two venues, and thicker lines mean more visitors took it.",
};

export const PLACE = {
  /** Used where the view used to be labelled "City Wide". */
  placeLabel: "All of Plymouth",
  compareLabel: "Compare with all of Plymouth →",
};

export const CHARTS = {
  countLabel: "Count",
  percentLabel: "% of total",
  percentHint: "Switch between raw counts and each bar's share of the total.",
};

export const FREE_VS_PAID = {
  title: "Free vs paid events",
  description:
    "How many events were free or paid, and how much of the intended attendance each accounts for. Price comes from ticketing exports; events whose export had no price are shown as \"price not recorded\".",
  groups: {
    free: "Free",
    paid: "Paid",
    unknown: "Price not recorded",
  },
  eventsLabel: "Events",
  attendanceLabel: "Intended attendance",
};

export const REPORT = {
  /** Heading prefix, followed by the long date of the report's Sunday. */
  weekEndingPrefix: "Week ending",
  cadence: "Weekly report · new data every Monday, covering the week to the previous Sunday.",
  customView: "You're viewing a custom range rather than the weekly report.",
  filteredLabel: "Custom view",
  resetLabel: "Back to weekly report",
  compareOptions: {
    week: { tab: "Week", previous: "previous week", current: "Latest week" },
    month: { tab: "Month", previous: "previous month", current: "Latest month" },
    quarter: { tab: "Quarter", previous: "previous quarter", current: "Latest quarter" },
  },
  trendBucketNote: {
    week: "Each point is one Monday–Sunday week.",
    month: "Each point is one calendar month.",
    quarter: "Each point is one calendar quarter.",
  },
};
