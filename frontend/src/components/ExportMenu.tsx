import { useState } from "react";

type Item = { label: string; onClick: () => void; disabled?: boolean };

/**
 * Tiny dropdown menu of export actions (CSV/PNG/etc).
 */
export default function ExportMenu({ items, label = "Export" }: { items: Item[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost text-xs"
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 min-w-[140px] rounded-md border border-border bg-card shadow-lg py-1">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-border/40 disabled:opacity-50"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
