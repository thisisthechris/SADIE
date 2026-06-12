interface LogoProps {
  height?: number;
  className?: string;
}

export default function Logo({ height = 48, className = "" }: LogoProps) {
  return (
    <img
      src="/brand/logo-blue.png"
      alt="Plymouth Culture"
      style={{ height }}
      className={`object-contain ${className}`}
    />
  );
}
