import { REPORT } from "../lib/copy";
import { describeRange, isDefaultView, longDate, reportWeek, useFilters } from "../lib/filters";

/**
 * ReportHeader: "Week ending Sunday 8 November 2026" plus the weekly cadence.
 * When the filters move away from the default weekly report, it says so and
 * shows the range actually being viewed.
 */
export default function ReportHeader() {
  const f = useFilters();
  const custom = !isDefaultView(f);

  return (
    <div className="text-sm">
      <div className="font-semibold text-accent">
        {REPORT.weekEndingPrefix} {longDate(reportWeek().end)}
      </div>
      <div className="text-muted">{custom ? `${REPORT.customView} ${describeRange(f)}.` : REPORT.cadence}</div>
    </div>
  );
}
