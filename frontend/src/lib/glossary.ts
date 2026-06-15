/**
 * Glossary: Plain-English definitions of key terms used throughout the dashboard.
 * Single source of truth for tooltips and Help page.
 */

export interface GlossaryTerm {
  term: string;
  short: string; // One-line explanation
  long: string; // Full explanation (2-3 sentences)
}

export const GLOSSARY: Record<string, GlossaryTerm> = {
  interaction: {
    term: "Interaction",
    short: "A visit to an event or venue.",
    long: "An interaction represents a single visit or engagement — someone viewing an event page, checking event details, or visiting a venue. We count these to understand how much engagement events and venues generate.",
  },
  unique_visitor: {
    term: "Unique Visitor",
    short: "A person who visited one or more events.",
    long: "A unique visitor is a single person (identified anonymously) who visited at least one event or venue during the time period shown. If the same person visits multiple events, they still count as one unique visitor. This tells us how many different people engaged with our events.",
  },
  event: {
    term: "Event",
    short: "An activity or programme offered by a partner organisation.",
    long: "An event is any activity, class, performance, workshop, or programme that a partner organisation is offering to the public. Events have dates, times, locations, and categories (e.g., music, theatre, learning).",
  },
  partner: {
    term: "Partner (Organisation)",
    short: "An arts or cultural organisation in Plymouth.",
    long: "A partner is an arts or cultural organisation in Plymouth that submits events to SADIE. Each event belongs to a partner, so we can track which organisations are most active and reach the most people.",
  },
  venue: {
    term: "Venue",
    short: "A physical location where events happen.",
    long: "A venue is a physical location — a theatre, gallery, studio, café — where events take place. Venues can host events for one or more organisations.",
  },
  postcode_area: {
    term: "Postcode Area",
    short: "A geographic region in Plymouth (e.g., PL1, PL4).",
    long: "Plymouth is divided into postcode areas (PL1, PL2, PL3, etc.). We show which postcode areas our visitors come from so partners can understand their geographic reach.",
  },
  privacy_grouping: {
    term: "Privacy Grouping",
    short: "Small geographic areas are merged to protect individual privacy.",
    long: "When showing visitor locations on maps, we combine small clusters of postcodes and group them together so that no single person's location can be identified. This protects privacy while still showing geographic trends.",
  },
  category: {
    term: "Category",
    short: "A type of event (e.g., music, theatre, learning).",
    long: "Categories describe the type of event — music, theatre, visual arts, learning, dance, etc. Events can belong to multiple categories, helping people find what interests them.",
  },
  network: {
    term: "Network (Graph)",
    short: "A visual map showing how partners, event types, and visitors connect.",
    long: "A network graph is an interactive diagram that shows relationships — which partners offer which event types, which visitor groups attend which partners. It helps visualise the ecosystem of cultural activity in Plymouth.",
  },
  time_cube: {
    term: "Time Cube",
    short: "A 3D map showing events by location, time, and type.",
    long: "A time cube is a three-dimensional chart where each event is a sphere positioned by location (horizontal position), how many days have passed (vertical), and event type (colour). You can rotate it to explore how events are distributed across time and space.",
  },
  new_vs_returning: {
    term: "New vs Returning Visitors",
    short: "Distinguishes first-time visitors from repeat attendees.",
    long: "New visitors are people attending events for the first time in the period shown. Returning visitors have attended events before. Tracking this helps partners understand whether they are attracting new audiences or building loyalty with existing ones.",
  },
  weekday_activity: {
    term: "Weekday Activity",
    short: "Which days of the week see the most events and engagement.",
    long: "A breakdown showing Monday through Sunday — how many events happen each day and how many people visit. Helps partners understand when their audience is most active.",
  },
  category_trends: {
    term: "Category Trends",
    short: "How the mix of event types changes over time.",
    long: "A chart showing how many events (and which categories) have been offered each month. Helps identify whether certain event types are growing or declining.",
  },
  venue_popularity: {
    term: "Venue Popularity",
    short: "Which venues host the most events or attract the most visitors.",
    long: "A ranking of venues by number of events hosted or total visitor interactions. Helps identify the most-used cultural spaces in Plymouth.",
  },
  buzz_per_event: {
    term: "Buzz per Event",
    short: "Average interactions (engagement) generated per event.",
    long: "A measure of how much engagement each event generates on average. High 'buzz' means events are attracting strong interest; low buzz might suggest events need better promotion.",
  },
  saved_view: {
    term: "Saved View",
    short: "A bookmark of a specific dashboard view with filters.",
    long: "A saved view is a snapshot of the dashboard at a particular moment — a specific page, filters, date range, and organisations selected. Save a view to quickly return to it later, or share it with others via a short link.",
  },
  comparison: {
    term: "Comparison (Side-by-Side)",
    short: "View two organisations or two time periods side-by-side.",
    long: "Compare two organisations to see which is reaching more people or hosting more events. Or compare two time periods (e.g., last month vs the month before) to spot growth or decline.",
  },
};

/**
 * Get a term definition by key.
 */
export function getTerm(key: string): GlossaryTerm | undefined {
  return GLOSSARY[key.toLowerCase().replace(/\s+/g, "_")];
}

/**
 * List all terms (for Help page).
 */
export function listTerms(): GlossaryTerm[] {
  return Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
}
