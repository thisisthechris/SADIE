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
}

/** Format a Date as local YYYY-MM-DD. */
function toIsoDate(d: Date): string {
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

const defaultState = (): FilterState => ({
  org: "",
  category: "",
  date_from: "",
  date_to: lastCompleteWeekEnd(),
  search: "",
  period: "",
  itype: "",
});

const empty: FilterState = defaultState();

interface FilterStore extends FilterState {
  set: (patch: Partial<FilterState>) => void;
  reset: () => void;
  /** Strip empty values for use as a query object. */
  asQuery: () => Record<string, string>;
}

export const useFilters = create<FilterStore>((set, get) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(defaultState()),
  asQuery: () => {
    const out: Record<string, string> = {};
    const s = get();
    (Object.keys(empty) as Array<keyof FilterState>).forEach((k) => {
      if (s[k]) out[k] = s[k];
    });
    return out;
  },
}));
