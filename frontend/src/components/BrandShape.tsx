interface BrandShapeProps {
  name: "cog-pink" | "cogarm-blue" | "halfmoon-yellow" | "circle-aqua";
  size?: number;
  opacity?: number;
  rotation?: number;
  className?: string;
}

export default function BrandShape({
  name,
  size = 64,
  opacity = 0.1,
  rotation = 0,
  className = "",
}: BrandShapeProps) {
  return (
    <img
      src={`/brand/shape-${name}.png`}
      alt=""
      aria-hidden
      style={{
        width: size,
        height: size,
        opacity,
        transform: `rotate(${rotation}deg)`,
        pointerEvents: "none",
      }}
      className={className}
    />
  );
}
