/**
 * Shared types, constants and helpers for the Postcode Areas pages.
 * Used by PostcodeAreasOverview and PostcodeAreasMap.
 */

export const DISTRICT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b",
];

export const MODE_COLORS: Record<string, string> = {
  bus:       "#7dd3fc",  // sky-300
  rail:      "#c4b5fd",  // violet-300
  ferry:     "#67e8f9",  // cyan-300
  park_ride: "#fcd34d",  // amber-300
};

export const MODE_LABELS: Record<string, string> = {
  bus: "Bus",
  rail: "Rail",
  ferry: "Ferry",
  park_ride: "Park & Ride",
};

export interface District {
  code: string;
  lng: number;
  lat: number;
  total: number;
}

export interface OrgRow {
  organisation: string;
  organisation_id: number | null;
  count: number;
}

export interface DistrictsResp {
  districts: District[];
  district?: string;
  orgs?: OrgRow[];
}

export interface FlowRow {
  from_code: string;
  from_lng: number;
  from_lat: number;
  to_location_id: number;
  to_name: string;
  to_org: string;
  to_lng: number;
  to_lat: number;
  count: number;
}

export interface PostcodeNode {
  code: string;
  lng: number;
  lat: number;
  total: number;
}

export interface VenueNode {
  location_id: number;
  name: string;
  organisation: string;
  organisation_id?: number | null;
  lng: number;
  lat: number;
}

export interface FlowsResp {
  postcode_nodes: PostcodeNode[];
  venue_nodes: VenueNode[];
  flows: FlowRow[];
  flow_count: number;
}

export interface VenueFlowsResp {
  flows: Array<{ from_id: number; from_name: string; to_id: number; to_name: string; count: number }>;
  nodes: VenueNode[];
}

export function districtColor(districts: District[], code: string): string {
  const idx = districts.findIndex((d) => d.code === code);
  return DISTRICT_COLORS[idx % DISTRICT_COLORS.length] ?? "#6366f1";
}

export function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Postcode ticket-volume (per-purchase) ───────────────────────────────────
// Used by the PostcodeVolume page + the ticket-volume layer on
// PostcodeAreasMap. Distinct from `District`/`DistrictsResp` above, which are
// sourced from aggregate interaction counts rather than ticket purchases.

export interface TicketDistrict {
  code: string;
  lng: number;
  lat: number;
  total_tickets: number;
  order_count: number;
  avg_party_size: number;
}

export interface TicketOrgRow {
  organisation: string;
  organisation_id: number | null;
  total_tickets: number;
  order_count: number;
}

export interface TicketDistrictsResp {
  districts: TicketDistrict[];
  district?: string;
  orgs?: TicketOrgRow[];
}

export interface PartySizeBucket {
  tickets: string;
  orders: number;
}

export interface TopTicketPostcode {
  code: string;
  total_tickets: number;
  order_count: number;
}

export interface TicketSummaryResp {
  total_tickets: number;
  total_orders: number;
  avg_party_size: number;
  party_size_distribution: PartySizeBucket[];
  top_postcodes: TopTicketPostcode[];
}

export interface TicketRecord {
  id: number;
  postcode: string;
  area: string;
  organisation: string;
  organisation_id: number | null;
  event_title: string;
  event_id: number | null;
  ticket_quantity: number;
  purchase_date: string | null;
}

export interface TicketRecordsResp {
  count: number;
  limit: number;
  results: TicketRecord[];
}
