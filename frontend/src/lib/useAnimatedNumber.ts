import { useEffect, useRef, useState } from "react";

/**
 * useAnimatedNumber: Smoothly tweens from the previous value to the target
 * value using requestAnimationFrame. Used so headline metric numbers count
 * up/down when the underlying data changes (e.g. toggling org/city filters,
 * or a filtered query refetching).
 *
 * Extracted from components/BigStat.tsx so any card showing a headline
 * number can reuse the same "counting" flourish.
 */
export function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    // easeOutCubic for a natural deceleration
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const current = from + (to - from) * ease(t);
      setDisplay(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = target;
    };
  }, [target, duration]);

  return display;
}
