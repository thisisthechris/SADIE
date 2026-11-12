import { describe, expect, it } from "vitest";
import { bucketLabel, describeRange, isDefaultView, periodRange, reportWeek, type FilterState } from "./filters";

// Thursday 12 November 2026; the latest complete week is Mon 2 – Sun 8 November.
const NOW = new Date(2026, 10, 12, 9, 0);

const base: FilterState = {
  org: "",
  category: "",
  search: "",
  itype: "",
  bucket: "week",
  period: "12w",
  ...periodRange("12w", NOW),
};

describe("reportWeek", () => {
  it("is the latest complete Monday–Sunday week", () => {
    expect(reportWeek(NOW)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });

  it("rolls forward on Monday", () => {
    expect(reportWeek(new Date(2026, 10, 16, 0, 5))).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });
});

describe("periodRange", () => {
  it("covers whole weeks ending last Sunday", () => {
    expect(periodRange("1w", NOW)).toEqual({ date_from: "2026-11-02", date_to: "2026-11-08" });
    expect(periodRange("4w", NOW)).toEqual({ date_from: "2026-10-12", date_to: "2026-11-08" });
    expect(periodRange("12w", NOW)).toEqual({ date_from: "2026-08-17", date_to: "2026-11-08" });
  });

  it("caps all time at last Sunday", () => {
    expect(periodRange("", NOW)).toEqual({ date_from: "", date_to: "2026-11-08" });
  });
});

describe("isDefaultView", () => {
  it("is true for the default weekly report, even with an organisation selected", () => {
    expect(isDefaultView(base, NOW)).toBe(true);
    expect(isDefaultView({ ...base, org: "3" }, NOW)).toBe(true);
  });

  it("is false once dates, grouping or narrowing filters change", () => {
    expect(isDefaultView({ ...base, ...periodRange("4w", NOW), period: "4w" }, NOW)).toBe(false);
    expect(isDefaultView({ ...base, bucket: "month" }, NOW)).toBe(false);
    expect(isDefaultView({ ...base, category: "2" }, NOW)).toBe(false);
  });
});

describe("describeRange", () => {
  it("names week periods and shows their dates", () => {
    expect(describeRange({ period: "4w", ...periodRange("4w", NOW) })).toBe("Last 4 weeks (12 Oct – 8 Nov 2026)");
  });

  it("describes custom and open-ended ranges", () => {
    expect(describeRange({ period: "custom", date_from: "2026-01-05", date_to: "2026-02-01" })).toBe(
      "5 Jan – 1 Feb 2026"
    );
    expect(describeRange({ period: "", date_from: "", date_to: "2026-11-08" })).toBe("up to 8 Nov 2026");
  });
});

describe("bucketLabel", () => {
  it("labels weeks, months and quarters", () => {
    expect(bucketLabel("2026-11-02", "week")).toBe("w/c 2 Nov");
    expect(bucketLabel("2026-11-01", "month")).toBe("Nov 2026");
    expect(bucketLabel("2026-10-01", "quarter")).toBe("Q4 2026");
    expect(bucketLabel("2026-11", "month")).toBe("Nov 2026");
  });
});
