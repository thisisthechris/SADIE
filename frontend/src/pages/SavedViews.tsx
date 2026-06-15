import { Link } from "react-router-dom";
import { useAllSavedViews, useDeleteSavedView, useMySavedViews } from "../lib/savedViews";

export default function SavedViews() {
  const mine = useMySavedViews();
  const all = useAllSavedViews();
  const del = useDeleteSavedView();

  const mineRows = mine.data?.results ?? [];
  const publicRows = (all.data?.results ?? []).filter(
    (v) => v.is_public && !mineRows.some((m) => m.id === v.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-small">Saved views</h1>
        <p className="text-sm text-muted">
          Bookmarked SPA pages with their filter state. Public views get a short shareable link.
        </p>
      </div>

      <Section title="My views" rows={mineRows} onDelete={(slug) => del.mutate(slug)} canDelete />
      <Section title="Public views" rows={publicRows} />
    </div>
  );
}

function Section({
  title,
  rows,
  onDelete,
  canDelete = false,
}: {
  title: string;
  rows: ReturnType<typeof useMySavedViews>["data"] extends infer T
    ? T extends { results: infer U } ? U : never
    : never;
  onDelete?: (slug: string) => void;
  canDelete?: boolean;
}) {
  return (
    <section className="card p-4">
      <h2 className="heading-sub mb-3">{title}</h2>
      {!rows?.length ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((v) => (
            <li key={v.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/insights/v/${v.slug}`}
                  className="font-medium truncate hover:underline block"
                >
                  {v.name}
                </Link>
                <div className="text-xs text-muted truncate">
                  {v.path}
                  {v.query_string ? `?${v.query_string}` : ""}
                  {v.is_public && <span className="ml-2 text-accent">· public</span>}
                </div>
              </div>
              {v.is_public && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    navigator.clipboard.writeText(`${window.location.origin}${v.short_url}`)
                  }
                  title="Copy short link"
                >
                  Copy link
                </button>
              )}
              <Link to={`/insights/v/${v.slug}`} className="btn-ghost text-xs">
                Open
              </Link>
              {canDelete && onDelete && (
                <button
                  type="button"
                  className="btn-ghost text-xs text-red-400"
                  onClick={() => {
                    if (confirm(`Delete "${v.name}"?`)) onDelete(v.slug);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
