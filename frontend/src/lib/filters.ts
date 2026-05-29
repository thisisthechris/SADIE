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

const empty: FilterState = {
  org: "",
  category: "",
  date_from: "",
  date_to: "",
  search: "",
  period: "",
  itype: "",
};

interface FilterStore extends FilterState {
  set: (patch: Partial<FilterState>) => void;
  reset: () => void;
  /** Strip empty values for use as a query object. */
  asQuery: () => Record<string, string>;
}

export const useFilters = create<FilterStore>((set, get) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(empty),
  asQuery: () => {
    const out: Record<string, string> = {};
    const s = get();
    (Object.keys(empty) as Array<keyof FilterState>).forEach((k) => {
      if (s[k]) out[k] = s[k];
    });
    return out;
  },
}));
