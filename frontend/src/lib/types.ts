/** Shared TS types matching the DRF responses. Keep in sync with serializers. */

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
  member_organisations: OrgRef[];
}

export interface RuntimeConfig {
  maptiler_api_key: string;
  default_map_center: [number, number];
  default_map_zoom: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  event_count?: number;
}

export interface OrgRef {
  id: number;
  slug: string;
  name: string;
  is_partner?: boolean;
}

export interface OrganisationSummary {
  id: number;
  name: string;
  slug: string;
  website?: string;
  description?: string;
  is_partner?: boolean;
  parent_id?: number | null;
  parent_name?: string | null;
  location_count?: number;
  event_count?: number;
  member_count?: number;
  created_at?: string;
}

export interface OrgMember {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export interface OrgLocation {
  id: number;
  name: string;
  address?: string;
  postcode?: string;
  point: unknown;
  created_at?: string;
}

export interface OrganisationDetail {
  id: number;
  slug: string;
  name: string;
  website: string;
  description: string;
  is_partner: boolean;
  parent: OrgRef | null;
  children: OrgRef[];
  members: OrgMember[];
  member_count: number;
  event_count: number;
  locations: OrgLocation[];
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventSummary {
  id: number;
  organisation: number;
  organisation_name: string;
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string | null;
  url: string | null;
  location: number | null;
  location_name: string | null;
  categories: Category[];
  image_url: string | null;
  source_url: string | null;
}

export interface StatsSummary {
  filters: Record<string, string>;
  org_count: number;
  location_count: number;
  event_count: number;
  interaction_count: number;
  unique_visitors: number;
  postcode_count: number;
  upcoming_events: Array<{
    id: number;
    title: string;
    start_datetime: string;
    url: string | null;
    image_url: string | null;
    organisation_id: number;
    organisation__name: string;
    location_id: number | null;
    location__name: string | null;
  }>;
}

export interface TopOrgsResponse {
  filters: Record<string, string>;
  results: Array<{
    organisation_id: number;
    organisation__name: string;
    organisation__slug: string;
    n: number;
  }>;
}

export interface TopCategoriesResponse {
  filters: Record<string, string>;
  results: Array<{ id: number; name: string; slug: string; n: number }>;
}

export interface TimeseriesResponse {
  filters: Record<string, string>;
  series: Array<{ month: string | null; count: number }>;
}

export interface PostcodeAggregatesResponse {
  filters: Record<string, string>;
  by_area: Array<{ area: string; total: number }>;
  by_postcode: Array<{ postcode: string; area: string; total: number }>;
}
