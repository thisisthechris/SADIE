import BrandShape from "./BrandShape";

interface EmptyStateProps {
  message: string;
  shape?: "cog-pink" | "cogarm-blue" | "halfmoon-yellow" | "circle-aqua";
  shapeSize?: number;
}

export default function EmptyState({
  message,
  shape = "circle-aqua",
  shapeSize = 48,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4">
        <BrandShape name={shape} size={shapeSize} opacity={0.15} />
      </div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
