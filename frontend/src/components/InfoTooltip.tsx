import { useState, useRef, useEffect } from "react";
import { getTerm } from "../lib/glossary";

interface InfoTooltipProps {
  /** Glossary key (e.g., "interaction", "unique_visitor") or freeform text. */
  text: string;
  /** Optional CSS class for the "?" button. */
  className?: string;
}

/**
 * InfoTooltip: Accessible "?" icon that shows a popover on hover/focus.
 *
 * If text matches a glossary key, shows the term definition.
 * Otherwise, shows the text as-is.
 *
 * Usage:
 *   <InfoTooltip text="interaction" className="inline ml-1" />
 *   <InfoTooltip text="Custom explanation here" />
 */
export default function InfoTooltip({ text, className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const term = getTerm(text);
  const title = term?.term || "Help";
  const content = term?.long || text;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full border border-current opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent transition ${className}`}
        aria-label={`Help: ${title}`}
        aria-describedby={open ? "tooltip-content" : undefined}
        title={title}
      >
        ?
      </button>

      {open && (
        <div
          ref={popoverRef}
          id="tooltip-content"
          className="absolute left-0 top-full mt-2 z-50 w-64 p-3 bg-card border border-border rounded shadow-lg animate-fade-in"
          role="tooltip"
        >
          <div className="text-xs font-semibold text-accent mb-1">{title}</div>
          <div className="text-xs text-muted leading-relaxed">{content}</div>
        </div>
      )}
    </div>
  );
}
