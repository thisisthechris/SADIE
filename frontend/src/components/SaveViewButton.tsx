import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters";
import { useCreateSavedView } from "../lib/savedViews";

/**
 * "Save view" — captures the current SPA path + filter querystring and saves
 * it as a named SavedView. Public views also expose a short link `/v/<slug>/`.
 */
export default function SaveViewButton() {
  const f = useFilters();
  const loc = useLocation();
  const m = useCreateSavedView();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const params = new URLSearchParams();
    Object.entries(f.asQuery()).forEach(([k, v]) => {
      if (v !== "" && v != null) params.set(k, String(v));
    });
    try {
      await m.mutateAsync({
        name: name.trim() || `View ${new Date().toLocaleString()}`,
        path: loc.pathname,
        query_string: params.toString(),
        is_public: isPublic,
      });
      setOpen(false);
      setName("");
      setIsPublic(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save view");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost text-xs"
        title="Save the current page + filters as a named view"
      >
        ★ Save view
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="card p-5 w-[min(420px,90vw)] space-y-3"
          >
            <h3 className="font-medium">Save current view</h3>
            <p className="text-xs text-muted">
              Captures <code>{loc.pathname}</code> with the active filters.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[10px] uppercase tracking-wide text-muted">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g. Plymouth gigs this month"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>Make public (shareable short link)</span>
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
                Cancel
              </button>
              <button type="submit" disabled={m.isPending} className="btn text-xs">
                {m.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
