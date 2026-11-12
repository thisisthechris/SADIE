import { create } from "zustand";

/**
 * Global filter state — mirrors the dashboard URL query schema so the SPA
 * can deep-link back to the legacy templates and vice versa.
 */
export interface FilterState {
  org: string;
  category: string;
  date_from: string;
  date_to: string;
  search: string;
  period: string;
  itype: string;
  /** Trend chart grouping: week | month | quarter. */
  bucket: string;
}

export type Bucket = "week" | "month" | "quarter";

/** Period shortcuts. Week periods are complete Mon–Sun weeks ending last Sunday. */
export const PERIODS = [
  { v: "1w", l: "Latest week", weeks: 1 },
  { v: "4w", l: "Last 4 weeks", weeks: 4 },
  { v: "12w", l: "Last 12 weeks", weeks: 12 },
  { v: "52w", l: "Last 52 weeks", weeks: 52 },
  { v: "", l: "All time", weeks: 0 },
];

export const BUCKETS: { v: Bucket; l: string }[] = [
  { v: "week", l: "Week" },
  { v: "month", l: "Month" },
  { v: "quarter", l: "Quarter" },
];

export const DEFAULT_PERIOD = "12w";

/** Format a Date as local YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Most recent Sunday strictly before today, as YYYY-MM-DD.
 * Weeks end on Sunday (UK convention), so this is the last complete week's end.
 */
export function lastCompleteWeekEnd(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = d.getDay(); // Sunday = 0
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  d.setDate(d.getDate() - daysBack);
  return toIsoDate(d);
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The latest complete Mon–Sun week, as YYYY-MM-DD strings. */
export function reportWeek(now: Date = new Date()): { start: string; end: string } {
  const end = parseIsoDate(lastCompleteWeekEnd(now));
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

/**
 * Date range for a period shortcut. Week periods cover whole Mon–Sun weeks
 * ending last Sunday; "All time" only caps the end at last Sunday.
 */
export function periodRange(period: string, now: Date = new Date()): { date_from: string; date_to: string } {
  const end = lastCompleteWeekEnd(now);
  const weeks = PERIODS.find((p) => p.v === period)?.weeks ?? 0;
  if (!weeks) return { date_from: "", date_to: end };
  const start = parseIsoDate(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  return { date_from: toIsoDate(start), date_to: end };
}

const defaultState = (now: Date = new Date()): FilterState => ({
  org: "",
  category: "",
  ...periodRange(DEFAULT_PERIOD, now),
  search: "",
  period: DEFAULT_PERIOD,
  itype: "",
  bucket: "week",
});

/** True when dates, grouping and narrowing filters match the default weekly report view. */
export function isDefaultView(s: FilterState, now: Date = new Date()): boolean {
  const d = defaultState(now);
  return (["category", "date_from", "date_to", "search", "period", "itype", "bucket"] as const).every(
    (k) => s[k] === d[k]
  );
}

/** Human-readable date range, e.g. "Last 4 weeks (12 Oct – 8 Nov 2026)". */
export function describeRange(s: Pick<FilterState, "period" | "date_from" | "date_to">): string {
  const fmt = (iso: string, withYear: boolean) =>
    parseIsoDate(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  const label = PERIODS.find((p) => p.v === s.period && p.weeks)?.l;
  const range =
    s.date_from && s.date_to
      ? `${fmt(s.date_from, false)} – ${fmt(s.date_to, true)}`
      : s.date_to
        ? `up to ${fmt(s.date_to, true)}`
        : s.date_from
          ? `from ${fmt(s.date_from, true)}`
          : "all dates";
  return label ? `${label} (${range})` : range;
}

/** Long form of a date for headers, e.g. "Sunday 8 November 2026". */
export function longDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Axis/tooltip label for a bucket start date (YYYY-MM-DD or YYYY-MM). */
export function bucketLabel(iso: string, bucket: string): string {
  if (!iso) return "";
  const d = parseIsoDate(iso.length === 7 ? `${iso}-01` : iso);
  if (bucket === "week") return `w/c ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  if (bucket === "quarter") return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

const empty: FilterState = defaultState();

interface FilterStore extends FilterState {
  set: (patch: Partial<FilterState>) => void;
  reset: () => void;
  /** Choose a period shortcut, filling in its explicit date range. */
  setPeriod: (period: string) => void;
  /** Strip empty values for use as a query object. */
  asQuery: () => Record<string, string>;
}

export const useFilters = create<FilterStore>((set, get) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(defaultState()),
  setPeriod: (period) => set({ period, ...periodRange(period) }),
  asQuery: () => {
    const out: Record<string, string> = {};
    const s = get();
    (Object.keys(empty) as Array<keyof FilterState>).forEach((k) => {
      if (s[k]) out[k] = s[k];
    });
    return out;
  },
}));
