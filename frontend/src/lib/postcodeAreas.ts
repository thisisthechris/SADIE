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
