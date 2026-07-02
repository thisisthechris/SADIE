import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface BigStatProps {
  /** The large headline number to display */
  value: number;
  /** The metric label ("Events", "Attendees", etc.) */
  label: string;
  /** The percentage change from previous period (positive or negative) */
  deltaPercent: number;
  /** Optional CSS classes for the container */
  className?: string;
}

/**
 * useAnimatedNumber: Smoothly tweens from the previous value to the target
 * value using requestAnimationFrame. Used so metric cards count up/down when
 * the underlying data changes (e.g. toggling org/city filters).
 */
function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = React.useState(target);
  const fromRef = React.useRef(target);
  const frameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
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

/**
 * BigStat: Large metric card for the org insights landing page.
 * Displays a prominent number with a trend indicator. The value and delta
 * count up/down smoothly whenever the underlying data changes.
 */
export const BigStat: React.FC<BigStatProps> = ({
  value,
  label,
  deltaPercent,
  className = "",
}) => {
  const animatedValue = useAnimatedNumber(value);
  const animatedDelta = useAnimatedNumber(deltaPercent);
  const isPositive = animatedDelta >= 0;
  const deltaAbs = Math.abs(animatedDelta);

  return (
    <div
      className={`bg-white p-6 rounded-lg shadow border border-gray-200 transition-all duration-300 ${className}`}
    >
      {/* Headline number */}
      <div className="heading-main mb-2">
        {Math.round(animatedValue).toLocaleString()}
      </div>

      {/* Label */}
      <div className="heading-sub mb-4">{label}</div>

      {/* Delta indicator */}
      <div className="flex items-center gap-2">
        {isPositive ? (
          <>
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-green-600 font-semibold">
              +{deltaAbs.toFixed(1)}%
            </span>
          </>
        ) : (
          <>
            <TrendingDown className="w-5 h-5 text-red-600" />
            <span className="text-red-600 font-semibold">
              {deltaAbs.toFixed(1)}%
            </span>
          </>
        )}
        <span className="text-sm text-gray-500 ml-1">vs last month</span>
      </div>
    </div>
  );
};
