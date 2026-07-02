import { useRef, useMemo, useCallback } from "react";

// Zoom levels ordered from finest to coarsest
const ZOOM_LEVELS = [
  { label: "1W", title: "1 week",   days: 7 },
  { label: "1M", title: "1 month",  days: 30 },
  { label: "3M", title: "3 months", days: 90 },
] as const;

export function fmtShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/** Convert ms timestamp to YYYY-MM-DD string for API query params. */
export function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface TimelineSliderProps {
  minMs: number;
  maxMs: number;
  offsetDays: number;
  windowDays: number;
  onOffsetChange: (d: number) => void;
  onWindowChange: (d: number) => void;
  /** Label for the right-side count, e.g. "3 of 176 flows". */
  countLabel?: string;
  /** When provided, the window handle displays a left-to-right linear gradient
   *  using these colours (ordered from earliest to latest bucket). */
  gradientColors?: string[];
}

export function TimelineSlider({
  minMs,
  maxMs,
  offsetDays,
  windowDays,
  onOffsetChange,
  onWindowChange,
  countLabel,
  gradientColors,
}: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const totalDays = Math.max(1, Math.ceil((maxMs - minMs) / 86_400_000));
  const maxOffset = Math.max(0, totalDays - windowDays);

  const zoomTo = (days: number) => {
    const clampedDays = Math.min(days, totalDays);
    const centre = offsetDays + windowDays / 2;
    const next = Math.round(centre - clampedDays / 2);
    onOffsetChange(Math.max(0, Math.min(Math.max(0, totalDays - clampedDays), next)));
    onWindowChange(clampedDays);
  };

  const zoomIn = () => {
    if (windowDays >= totalDays) { zoomTo(90); return; }
    if (windowDays > 30) { zoomTo(30); return; }
    zoomTo(7);
  };
  const zoomOut = () => {
    if (windowDays <= 7) { zoomTo(30); return; }
    if (windowDays <= 30) { zoomTo(90); return; }
    zoomTo(totalDays);
  };
  const isMaxZoom = windowDays <= 7;
  const isMinZoom = windowDays >= totalDays;

  const activeZoomLabel =
    windowDays >= totalDays ? "All"
    : windowDays <= 7 ? "1W"
    : windowDays <= 30 ? "1M"
    : "3M";

  const xToOffset = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return offsetDays;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const centred = Math.round(frac * totalDays - windowDays / 2);
      return Math.max(0, Math.min(maxOffset, centred));
    },
    [totalDays, windowDays, maxOffset, offsetDays],
  );

  const dragStartX = useRef<number | null>(null);
  const dragStartOffset = useRef<number>(0);

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).dataset.handle) {
        dragStartX.current = e.clientX;
        dragStartOffset.current = offsetDays;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        onOffsetChange(xToOffset(e.clientX));
      }
    },
    [offsetDays, onOffsetChange, xToOffset],
  );

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartX.current === null) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaPx = e.clientX - dragStartX.current;
      const deltaDays = Math.round((deltaPx / rect.width) * totalDays);
      const next = Math.max(0, Math.min(maxOffset, dragStartOffset.current + deltaDays));
      onOffsetChange(next);
    },
    [totalDays, maxOffset, onOffsetChange],
  );

  const onTrackPointerUp = useCallback(() => {
    dragStartX.current = null;
  }, []);

  const ticks: { label: string; frac: number }[] = useMemo(() => {
    const out: { label: string; frac: number }[] = [];
    if (windowDays <= 30) {
      const visStart = minMs + offsetDays * 86_400_000;
      const visEnd = visStart + windowDays * 86_400_000;
      const cursor = new Date(visStart);
      cursor.setHours(0, 0, 0, 0);
      const dayOfWeek = cursor.getDay();
      const daysToMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      cursor.setDate(cursor.getDate() + daysToMon);
      while (cursor.getTime() <= visEnd) {
        const frac = (cursor.getTime() - minMs) / (maxMs - minMs);
        if (frac >= 0 && frac <= 1) {
          out.push({
            label: cursor.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            frac,
          });
        }
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(minMs);
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + 1);
      while (cursor.getTime() < maxMs) {
        const frac = (cursor.getTime() - minMs) / (maxMs - minMs);
        out.push({
          label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
          frac,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return out;
  }, [minMs, maxMs, windowDays, offsetDays]);

  const windowStartFrac = offsetDays / totalDays;
  const windowWidthFrac = Math.min(1, windowDays / totalDays);
  const startMs = minMs + offsetDays * 86_400_000;
  const endMs = startMs + windowDays * 86_400_000;

  const stepOffset = (delta: number) => {
    onOffsetChange(Math.max(0, Math.min(maxOffset, offsetDays + delta)));
  };

  return (
    <div className="card p-4 space-y-3">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted flex-wrap">
        <div>
          <span className="text-fg font-medium">{fmtShort(startMs)}</span>
          {" → "}
          <span className="text-fg font-medium">{fmtShort(endMs)}</span>
        </div>
        <div className="flex items-center gap-2">
          {countLabel && <span>{countLabel}</span>}
          {countLabel && <span className="text-border">|</span>}
          <span className="text-[10px] text-muted">Zoom:</span>
          {(ZOOM_LEVELS as ReadonlyArray<{ label: string; title: string; days: number }>).map((z) => (
            <button
              key={z.label}
              onClick={() => zoomTo(z.days)}
              title={z.title}
              className={
                "px-1.5 py-0.5 rounded text-[10px] border " +
                (activeZoomLabel === z.label
                  ? "bg-accent text-white border-accent"
                  : "border-border hover:bg-border/30")
              }
            >
              {z.label}
            </button>
          ))}
          <button
            onClick={() => { onOffsetChange(0); zoomTo(totalDays); }}
            title="Show all"
            className={
              "px-1.5 py-0.5 rounded text-[10px] border " +
              (activeZoomLabel === "All"
                ? "bg-accent text-white border-accent"
                : "border-border hover:bg-border/30")
            }
          >
            All
          </button>
          <span className="text-border">|</span>
          <button
            onClick={zoomIn}
            disabled={isMaxZoom}
            className="btn-ghost text-xs px-1.5 py-0.5 disabled:opacity-30"
            title="Zoom in"
          >+</button>
          <button
            onClick={zoomOut}
            disabled={isMinZoom}
            className="btn-ghost text-xs px-1.5 py-0.5 disabled:opacity-30"
            title="Zoom out"
          >−</button>
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative select-none">
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepOffset(-windowDays)}
            className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
            aria-label="Previous window"
          >←</button>

          <div
            ref={trackRef}
            className="relative flex-1 h-8 rounded-lg bg-border/30 cursor-pointer overflow-hidden"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onPointerLeave={onTrackPointerUp}
          >
            {ticks.map((t) => (
              <div
                key={t.label}
                className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
                style={{ left: `${t.frac * 100}%`, transform: "translateX(-50%)" }}
              >
                <div className="w-px h-2 bg-border/60 mt-1" />
                <span className="text-[9px] text-muted/70 mt-0.5 whitespace-nowrap">{t.label}</span>
              </div>
            ))}

            <div
              data-handle="1"
              className="absolute top-0 h-full border-x-2 border-white/60 cursor-grab active:cursor-grabbing"
              style={{
                left: `${windowStartFrac * 100}%`,
                width: `${Math.max(windowWidthFrac * 100, 1)}%`,
                background: gradientColors?.length
                  ? `linear-gradient(to right, ${gradientColors.join(", ")})`
                  : "rgba(var(--color-accent), 0.25)",
                opacity: 0.8,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
                <span className="w-0.5 h-3 rounded-full bg-white/70" />
                <span className="w-0.5 h-3 rounded-full bg-white/70" />
                <span className="w-0.5 h-3 rounded-full bg-white/70" />
              </div>
            </div>
          </div>

          <button
            onClick={() => stepOffset(windowDays)}
            className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
            aria-label="Next window"
          >→</button>
        </div>

        <div className="flex justify-between text-[9px] text-muted mt-1 px-8">
          <span>{fmtShort(minMs)}</span>
          <span>{fmtShort(maxMs)}</span>
        </div>
      </div>
    </div>
  );
}
