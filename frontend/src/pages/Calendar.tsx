import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import OrgToggle from "../components/OrgToggle";
import type { EventSummary, Paginated } from "../lib/types";

// Computed once at module load — stable for the lifetime of the page session.
const TODAY = new Date();
const TODAY_ISO = toISODate(TODAY);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthFirstDay(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function monthLastDay(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/** Monday-start offset: how many blank cells precede day 1. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export default function CalendarPage() {
  const f = useFilters();

  const [viewMonth, setViewMonth] = useState({
    year: TODAY.getFullYear(),
    month: TODAY.getMonth(),
  });
  const [selectedDay, setSelectedDay] = useState<string>(TODAY_ISO);
  const [copied, setCopied] = useState(false);

  const { year, month } = viewMonth;
  const firstDay = toISODate(monthFirstDay(year, month));
  const lastDay = toISODate(monthLastDay(year, month));

  // Override any global date filters with the visible month range.
  const q: Record<string, string> = {
    ...f.asQuery(),
    ordering: "start_datetime",
    date_from: firstDay,
    date_to: lastDay,
    page_size: "200",
  };

  const events = useQuery({
    queryKey: ["calendar-events", q],
    queryFn: async () => {
      const all: EventSummary[] = [];
      let page: Paginated<EventSummary> = await api<Paginated<EventSummary>>(
        "/api/events/",
        { query: q }
      );
      all.push(...page.results);
      while (page.next) {
        const nextUrl = new URL(page.next);
        page = await api<Paginated<EventSummary>>(
          nextUrl.pathname + nextUrl.search
        );
        all.push(...page.results);
      }
      return all;
    },
  });

  // Build YYYY-MM-DD → events[] map for O(1) cell lookup.
  const eventsByDay = new Map<string, EventSummary[]>();
  for (const e of events.data ?? []) {
    const day = e.start_datetime.slice(0, 10);
    const arr = eventsByDay.get(day) ?? [];
    arr.push(e);
    eventsByDay.set(day, arr);
  }

  // Busiest day count — used to scale heat intensity across cells.
  const maxCount = Math.max(0, ...Array.from(eventsByDay.values()).map((a) => a.length));

  // Sorted day keys for the agenda list.
  const agendaDays = Array.from(eventsByDay.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const monthLabel = monthFirstDay(year, month).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Build the grid cell array (nulls = leading/trailing blanks).
  const blanks = leadingBlanks(year, month);
  const totalDays = monthLastDay(year, month).getDate();
  const cells: Array<{ day: number; iso: string } | null> = [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => {
      const d = i + 1;
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { day: d, iso };
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    setViewMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    );
  }

  function nextMonth() {
    setViewMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    );
  }

  function goToday() {
    setViewMonth({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
    setSelectedDay(TODAY_ISO);
    setTimeout(() => {
      document
        .getElementById(`day-${TODAY_ISO}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function selectDay(iso: string) {
    setSelectedDay(iso);
    document
      .getElementById(`day-${iso}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const subscribeUrls = buildSubscribeUrls({
    ...f.asQuery(),
    date_from: firstDay,
    date_to: lastDay,
  });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(subscribeUrls.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div>
            <h1 className="heading-main">Calendar</h1>
            <p className="body-lg">
              Browse events by month. Click a day to jump to its agenda below.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href={subscribeUrls.webcal}
              className="btn-ghost border border-border"
              title="Open in your default calendar app"
            >
              Subscribe (webcal)
            </a>
            <a
              href={subscribeUrls.https}
              download="sadie-events.ics"
              className="btn-ghost border border-border"
            >
              Download .ics
            </a>
            <a
              href={subscribeUrls.json}
              download="sadie-events.json"
              className="btn-ghost border border-border"
            >
              Download .json
            </a>
            <a
              href={subscribeUrls.rss}
              className="btn-ghost border border-border"
              title="Subscribe in your RSS reader"
            >
              RSS Feed
            </a>
            <button
              type="button"
              onClick={onCopy}
              className="btn-ghost border border-border"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <OrgToggle />
          {events.data !== undefined && (
            <div className="stat text-right">
              <div className="stat-label">This month</div>
              <div className="stat-value">{events.data.length.toLocaleString()}</div>
              <div className="text-[10px] text-muted mt-0.5">events</div>
            </div>
          )}
        </div>
      </div>

      {f.org && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm flex items-center justify-between gap-4">
          <span>Showing events for one organisation only.</span>
          <button
            onClick={() => f.set({ org: "" })}
            className="btn-ghost text-xs border border-border"
          >
            Switch to City Wide
          </button>
        </div>
      )}

      {/* ── Month grid ── */}
      <div className="card p-4 space-y-3">
        {/* Navigation row */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={prevMonth}
            className="btn-ghost text-xs"
            aria-label="Previous month"
          >
            ← Prev
          </button>
          <div className="flex items-center gap-3">
            <h2 className="heading-sub">{monthLabel}</h2>
            <button
              onClick={goToday}
              className="btn-ghost text-xs border border-border"
            >
              Today
            </button>
          </div>
          <button
            onClick={nextMonth}
            className="btn-ghost text-xs"
            aria-label="Next month"
          >
            Next →
          </button>
        </div>

        {/* Weekday header row */}
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="text-center text-[10px] uppercase tracking-wide text-muted py-1"
            >
              {wd}
            </div>
          ))}

          {/* Day cells */}
          {cells.map((cell, i) => {
            if (!cell) {
              return (
                <div
                  key={`blank-${i}`}
                  className="h-12 rounded-lg"
                />
              );
            }
            const { day, iso } = cell;
            const isToday = iso === TODAY_ISO;
            const isSelected = iso === selectedDay;
            const count = eventsByDay.get(iso)?.length ?? 0;
            // Heat: scale from 0.07 (1 event) up to 0.32 (busiest day).
            const heatOpacity = maxCount > 0 && count > 0
              ? 0.07 + (count / maxCount) * 0.25
              : 0;
            const heatStyle =
              !isSelected && heatOpacity > 0
                ? { backgroundColor: `rgba(0,31,204,${heatOpacity.toFixed(3)})` }
                : undefined;

            return (
              <button
                key={iso}
                onClick={() => selectDay(iso)}
                style={heatStyle}
                className={[
                  "h-12 w-full flex flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-accent text-white"
                    : isToday
                    ? "ring-2 ring-accent hover:bg-border/30"
                    : "hover:bg-border/30",
                ].join(" ")}
                aria-label={`${iso}${
                  count > 0 ? `, ${count} event${count === 1 ? "" : "s"}` : ""
                }`}
                aria-pressed={isSelected}
              >
                <span className={isSelected ? "text-white" : "text-fg"}>{day}</span>
                {count > 0 && (
                  <span
                    className={[
                      "text-[9px] font-semibold tabular-nums leading-none",
                      isSelected ? "text-white/80" : "text-accent",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Agenda ── */}
      <div className="card p-4">
        {!events.isLoading && agendaDays.length === 0 && (
          <p className="text-sm text-muted">
            No events found for this month.
          </p>
        )}

        <div className="space-y-5">
          {agendaDays.map(([iso, items]) => (
            <div key={iso} id={`day-${iso}`} className="scroll-mt-20">
              {/* Day heading */}
              <div className="text-xs uppercase tracking-wide text-muted font-medium mb-2">
                {new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>

              {/* Event rows */}
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {items.map((e) => (
                  <li
                    key={e.id}
                    className="py-2 px-3 flex items-center gap-3 bg-card"
                  >
                    <div className="text-xs text-muted w-12 tabular-nums flex-shrink-0">
                      {new Date(e.start_datetime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {e.image_url && (
                      <img
                        src={e.image_url}
                        alt={e.title}
                        className="w-10 h-10 object-cover rounded flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/insights/events/${e.id}`}
                        className="font-medium hover:text-accent truncate block"
                      >
                        {e.title}
                      </Link>
                      <div className="text-xs text-muted truncate">
                        {e.organisation_name}
                        {e.location_name ? ` · ${e.location_name}` : ""}
                      </div>
                    </div>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost text-xs flex-shrink-0"
                      >
                        Open
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildSubscribeUrls(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  const icsPath = qs ? `/calendar.ics?${qs}` : "/calendar.ics";
  const jsonPath = qs ? `/events.json?${qs}` : "/events.json";
  const rssPath = qs ? `/events.rss?${qs}` : "/events.rss";

  const https = `${window.location.origin}${icsPath}`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");

  return {
    https,
    webcal,
    json: `${window.location.origin}${jsonPath}`,
    rss: `${window.location.origin}${rssPath}`,
  };
}
