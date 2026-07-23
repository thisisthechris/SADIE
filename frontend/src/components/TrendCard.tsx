import { useEffect, useState, type ReactNode } from "react";
import InfoTooltip from "./InfoTooltip";

interface TrendCardProps {
  title: string;
  /** Glossary key passed to InfoTooltip (see lib/glossary.ts). */
  tooltipText: string;
  /** Render prop so the chart can be re-rendered bigger when expanded. */
  children: (height: number) => ReactNode;
  /** Chart height in the normal (non-expanded) card. */
  height?: number;
  /** Chart height when the card is expanded to fullscreen. */
  expandedHeight?: number;
}

/**
 * TrendCard: Standard "card p-6" wrapper for a Trends page chart, with a
 * fullscreen/expand toggle. Click the expand icon (or press Escape / click
 * outside while expanded) to view the chart larger in a modal overlay.
 */
export default function TrendCard({
  title,
  tooltipText,
  children,
  height = 300,
  expandedHeight = 600,
}: TrendCardProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const header = (isExpanded: boolean) => (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        <h2 className="heading-small">{title}</h2>
        <InfoTooltip text={tooltipText} />
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!isExpanded)}
        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted hover:text-accent hover:border-accent/60 transition-colors"
        aria-label={isExpanded ? "Exit fullscreen" : "View fullscreen"}
        title={isExpanded ? "Exit fullscreen" : "View fullscreen"}
      >
        {isExpanded ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"
            />
          </svg>
        )}
      </button>
    </div>
  );

  return (
    <>
      <div className="card p-6">
        {header(false)}
        {children(height)}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setExpanded(false)}
        >
          <div
            className="card p-6 w-full max-w-6xl max-h-[90vh] overflow-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {header(true)}
            {children(expandedHeight)}
          </div>
        </div>
      )}
    </>
  );
}
