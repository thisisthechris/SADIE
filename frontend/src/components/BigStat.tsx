import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";

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
    <div className={`card card-hover p-6 transition-all duration-300 ${className}`}>
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
        <span className="text-sm text-muted ml-1">vs last month</span>
      </div>
    </div>
  );
};
