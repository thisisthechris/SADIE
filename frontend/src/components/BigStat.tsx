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
 * BigStat: Large metric card for the org insights landing page.
 * Displays a prominent number with a trend indicator.
 */
export const BigStat: React.FC<BigStatProps> = ({
  value,
  label,
  deltaPercent,
  className = "",
}) => {
  const isPositive = deltaPercent >= 0;
  const deltaAbs = Math.abs(deltaPercent);

  return (
    <div
      className={`bg-white p-6 rounded-lg shadow border border-gray-200 ${className}`}
    >
      {/* Headline number */}
      <div className="heading-main mb-2">
        {value.toLocaleString()}
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
