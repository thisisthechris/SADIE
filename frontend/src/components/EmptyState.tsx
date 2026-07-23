import BrandShape from "./BrandShape";

interface EmptyStateProps {
  title?: string;
  message: string;
  shape?: "cog-pink" | "cogarm-blue" | "halfmoon-yellow" | "circle-aqua";
  shapeSize?: number;
}

export default function EmptyState({
  title,
  message,
  shape = "circle-aqua",
  shapeSize = 48,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4">
        <BrandShape name={shape} size={shapeSize} opacity={0.15} />
      </div>
      {title && <h3 className="text-sm font-semibold text-muted mb-1">{title}</h3>}
      <p className="text-sm text-muted/70 max-w-sm">{message}</p>
    </div>
  );
}

// Re-export as named export for convenience
export { EmptyState as EmptyStateComponent };

/**
 * LoadingState: Skeleton/spinner placeholder.
 *
 * - "spinner" (default): small centered spinner, for inline/button-level loads.
 * - "chart": a chart-shaped pulsing skeleton (a row of variable-height bars),
 *   sized to the same `height` a TrendCard passes to its chart, so the card
 *   doesn't jump when real data replaces it.
 */
export interface LoadingStateProps {
  message?: string;
  variant?: "spinner" | "chart";
  height?: number;
}

export function LoadingState({ message = "Loading…", variant = "spinner", height = 300 }: LoadingStateProps) {
  if (variant === "chart") {
    const bars = [55, 80, 40, 95, 65, 85, 50, 70];
    return (
      <div
        className="flex items-end justify-center gap-3 px-4"
        style={{ height }}
        role="status"
        aria-label={message}
      >
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 max-w-[3rem] rounded-t bg-border/60 animate-pulse"
            style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin mb-3" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
