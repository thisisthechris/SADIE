import { describe, expect, it } from "vitest";
import { percentOfRow, percentOfTotal, valueFormatter } from "./percent";
import { lastCompleteWeekEnd } from "./filters";

describe("percentOfTotal", () => {
  it("converts each series to its share of its own column total", () => {
    const rows = [
      { day: "Mon", events: 1, interactions: 30 },
      { day: "Tue", events: 3, interactions: 10 },
    ];
    expect(percentOfTotal(rows, ["events", "interactions"])).toEqual([
      { day: "Mon", events: 25, interactions: 75 },
      { day: "Tue", events: 75, interactions: 25 },
    ]);
  });

  it("rounds to one decimal place and leaves the input untouched", () => {
    const rows = [{ n: 1 }, { n: 2 }];
    expect(percentOfTotal(rows, ["n"])).toEqual([{ n: 33.3 }, { n: 66.7 }]);
    expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("returns zeros rather than NaN when the total is zero", () => {
    expect(percentOfTotal([{ n: 0 }, { n: 0 }], ["n"])).toEqual([{ n: 0 }, { n: 0 }]);
  });
});

describe("percentOfRow", () => {
  it("makes each row sum to 100 across the given keys, skipping missing keys", () => {
    const rows = [
      { district: "PL1", Morning: 1, Evening: 3 },
      { district: "PL4", Morning: 2 },
    ];
    expect(percentOfRow(rows as Array<Record<string, string | number>>, ["Morning", "Evening"])).toEqual([
      { district: "PL1", Morning: 25, Evening: 75 },
      { district: "PL4", Morning: 100 },
    ]);
  });
});

describe("valueFormatter", () => {
  it("formats counts with separators and percentages with a % sign", () => {
    expect(valueFormatter(false)(1234)).toBe((1234).toLocaleString());
    expect(valueFormatter(true)(37.5)).toBe("37.5%");
  });
});

describe("lastCompleteWeekEnd", () => {
  it("returns the previous Sunday mid-week", () => {
    // Wednesday 4 November 2026 -> Sunday 1 November 2026
    expect(lastCompleteWeekEnd(new Date(2026, 10, 4, 10, 0))).toBe("2026-11-01");
  });

  it("returns the Sunday a week earlier when today is Sunday (the week is not complete yet)", () => {
    expect(lastCompleteWeekEnd(new Date(2026, 10, 8, 9, 0))).toBe("2026-11-01");
  });

  it("returns yesterday on a Monday", () => {
    expect(lastCompleteWeekEnd(new Date(2026, 10, 9, 0, 30))).toBe("2026-11-08");
  });
});
