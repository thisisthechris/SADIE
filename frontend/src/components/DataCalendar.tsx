import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DATA_CALENDAR } from "../lib/copy";
import { bucketLabel } from "../lib/filters";

export interface CalendarWeek {
  week_start: string;
  interactions: number;
  tickets: number;
  uploads: number;
  gap: boolean;
}

export interface OrgCalendar {
  organisation: { id: number; name: string };
  weeks_with_data: number;
  gap_weeks: number;
  last_week_with_data: string | null;
  calendar: CalendarWeek[];
}

/** Five-step colour scale relative to the busiest week; gaps get a dashed outline. */
function cellClass(week: CalendarWeek, max: number): string {
  if (week.gap) return "bg-amber-50 border border-dashed border-amber-300";
  const level = Math.min(4, Math.floor((week.interactions / Math.max(max, 1)) * 4.999));
  return ["bg-accent/20", "bg-accent/40", "bg-accent/60", "bg-accent/80", "bg-accent"][level];
}

function weekTitle(w: CalendarWeek): string {
  const when = bucketLabel(w.week_start, "week");
  if (w.gap) return `${when}: ${DATA_CALENDAR.gap}`;
  const uploads = w.uploads ? ` from ${w.uploads} upload${w.uploads === 1 ? "" : "s"}` : "";
  return `${when}: ${w.interactions.toLocaleString()} interactions, ${w.tickets.toLocaleString()} tickets${uploads}`;
}

/** One strip of week squares. ``highlight`` weeks pop in, e.g. those just uploaded. */
export function WeekStrip({
  weeks,
  highlight,
  size = "md",
}: {
  weeks: CalendarWeek[];
  highlight?: Set<string>;
  size?: "sm" | "md";
}) {
  const max = Math.max(...weeks.map((w) => w.interactions), 1);
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  let popIndex = 0;
  return (
    <div className="flex flex-wrap gap-1" role="list">
      {weeks.map((w) => {
        const fresh = highlight?.has(w.week_start);
        const delay = fresh ? popIndex++ * 60 : 0;
        return (
          <span
            key={w.week_start}
            role="listitem"
            title={weekTitle(w)}
            aria-label={weekTitle(w)}
            className={`${dim} rounded-sm ${cellClass(w, max)} ${fresh ? "animate-pop-in ring-2 ring-pink" : ""}`}
            style={fresh ? { animationDelay: `${delay}ms` } : undefined}
          />
        );
      })}
    </div>
  );
}

/** Data calendar for one organisation: the last 52 weeks with gaps highlighted. */
export default function DataCalendar({ orgId, highlight }: { orgId: number | string; highlight?: Set<string> }) {
  const q = useQuery({
    queryKey: ["data-calendar", String(orgId)],
    queryFn: () => api<OrgCalendar>("/api/analytics/data-calendar/", { query: { org: orgId, weeks: 52 } }),
    enabled: Boolean(orgId),
  });

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="heading-small">{DATA_CALENDAR.title}</h2>
        {q.data && (
          <span className="text-xs text-muted">
            {q.data.weeks_with_data} of 52 weeks with data
            {q.data.gap_weeks ? ` · ${q.data.gap_weeks} gap${q.data.gap_weeks === 1 ? "" : "s"}` : " · no gaps 🎉"}
          </span>
        )}
      </div>
      <p className="text-sm text-muted">{DATA_CALENDAR.intro}</p>
      {q.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : q.isError || !q.data ? (
        <p className="text-sm text-muted">The data calendar couldn't be loaded.</p>
      ) : (
        <>
          <WeekStrip weeks={q.data.calendar} highlight={highlight} />
          <div className="flex justify-between text-[11px] text-muted">
            <span>{bucketLabel(q.data.calendar[0]?.week_start ?? "", "week")}</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-50 border border-dashed border-amber-300" /> gap
              <span className="w-2.5 h-2.5 rounded-sm bg-accent/20 ml-2" /> fewer
              <span className="w-2.5 h-2.5 rounded-sm bg-accent" /> more
            </span>
            <span>{bucketLabel(q.data.calendar.at(-1)?.week_start ?? "", "week")}</span>
          </div>
        </>
      )}
    </section>
  );
}
