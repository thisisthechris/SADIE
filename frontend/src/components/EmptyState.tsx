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
 */
export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading…" }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin mb-3" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
