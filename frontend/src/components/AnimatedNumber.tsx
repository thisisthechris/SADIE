import { useAnimatedNumber } from "../lib/useAnimatedNumber";

interface AnimatedNumberProps {
  /** The target number to display. */
  value: number;
  /** Format the in-between (tweening) value for display. Defaults to a
   * rounded, comma-grouped integer (`Math.round(n).toLocaleString()`). */
  format?: (n: number) => string;
  duration?: number;
}

/**
 * AnimatedNumber: drop-in replacement for a static headline number that
 * counts up/down smoothly whenever `value` changes (e.g. a filter/org toggle
 * changes the underlying query result). Implemented as its own component
 * (rather than calling the `useAnimatedNumber` hook inline) so it can be used
 * inside conditionally-rendered JSX without violating the rules of hooks —
 * each instance owns its own independent tween.
 */
export default function AnimatedNumber({ value, format, duration }: AnimatedNumberProps) {
  const animated = useAnimatedNumber(value, duration);
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString());
  return <>{fmt(animated)}</>;
}
