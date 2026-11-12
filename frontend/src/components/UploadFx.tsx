import { useEffect, useMemo, useState } from "react";
import BrandShape from "./BrandShape";

const SHAPES = ["cog-pink", "cogarm-blue", "halfmoon-yellow", "circle-aqua"] as const;

/** A one-off burst of brand shapes from the centre of its container. */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 120 + Math.random() * 160;
        return {
          shape: SHAPES[i % SHAPES.length],
          size: 14 + Math.random() * 16,
          style: {
            "--dx": `${Math.cos(angle) * dist}px`,
            "--dy": `${Math.sin(angle) * dist + 80}px`,
            "--spin": `${Math.random() * 720 - 360}deg`,
            animationDelay: `${Math.random() * 120}ms`,
          } as React.CSSProperties,
        };
      }),
    [pieces],
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} className="absolute animate-confetti-fall" style={b.style}>
          <BrandShape name={b.shape} size={b.size} opacity={0.9} />
        </span>
      ))}
    </div>
  );
}

const HEX = "0123456789abcdef";

/**
 * Shows a masked email visibly "scrambling" into its hash, a character at a
 * time. Purely illustrative: the masked email is all that's ever on screen.
 */
export function HashScramble({ from, to }: { from: string; to: string }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const target = to.slice(0, 24);
    let frame = 0;
    const total = 28;
    const id = window.setInterval(() => {
      frame++;
      const settled = Math.floor((frame / total) * target.length);
      setShown(
        target
          .split("")
          .map((c, i) => (i < settled ? c : HEX[Math.floor(Math.random() * 16)]))
          .join(""),
      );
      if (frame >= total) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
  }, [from, to]);

  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="text-muted line-through decoration-pink/70">{from}</span>
      <span aria-hidden>→</span>
      <span className="text-accent">{shown}…</span>
    </div>
  );
}
