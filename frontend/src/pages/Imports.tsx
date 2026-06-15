import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Paginated } from "../lib/savedViews";
import EmptyState from "../components/EmptyState";

type ImportedEvent = {
  id: number;
  source_name: string;
  external_id: string;
  title: string;
  description: string;
  start_datetime: string | null;
  end_datetime: string | null;
  source_url: string;
  image_url: string;
  venue_name: string;
  venue_postcode: string;
  status: "pending" | "auto_matched" | "approved" | "rejected" | "imported";
  matched_event_id: number | null;
  matched_organisation: number | null;
  matched_organisation_name: string | null;
  reviewed_by_username: string | null;
};

const STATUSES: ImportedEvent["status"][] = [
  "pending",
  "auto_matched",
  "approved",
  "rejected",
  "imported",
];
const STATUS_LABEL: Record<ImportedEvent["status"], string> = {
  pending: "Pending",
  auto_matched: "Auto-matched",
  approved: "Approved",
  rejected: "Rejected",
  imported: "Imported",
};

export default function Imports() {
  const qc = useQueryClient();
  const counts = useQuery({
    queryKey: ["imports-counts"],
    queryFn: () => api<Record<string, number>>("/api/imports/counts/"),
  });
  const all = useQuery({
    queryKey: ["imports-list"],
    queryFn: () =>
      api<Paginated<ImportedEvent>>("/api/imports/", {
        query: { page_size: 200, ordering: "-created_at" },
      }),
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const out: Record<ImportedEvent["status"], ImportedEvent[]> = {
      pending: [],
      auto_matched: [],
      approved: [],
      rejected: [],
      imported: [],
    };
    (all.data?.results ?? []).forEach((e) => {
      out[e.status]?.push(e);
    });
    return out;
  }, [all.data]);

  const bulk = useMutation({
    mutationFn: (action: string) =>
      api<{ updated: number; imported: number; errors: any[] }>(
        "/api/imports/bulk-action/",
        { method: "POST", body: { ids: Array.from(selected), action } },
      ),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["imports-list"] });
      qc.invalidateQueries({ queryKey: ["imports-counts"] });
    },
  });

  const toggleSel = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="heading-small">Import review queue</h1>
          <p className="body-lg">
            Triage scraped events. Approve to mark for import, then run "Import" to write them
            into the live <code>events</code> table.
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{selected.size} selected</span>
            <button
              className="btn-ghost text-xs"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("approve")}
            >
              Approve
            </button>
            <button
              className="btn-ghost text-xs text-red-400"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("reject")}
            >
              Reject
            </button>
            <button
              className="btn text-xs"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("import")}
            >
              Import to events
            </button>
            <button
              className="btn-ghost text-xs"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("reset")}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {bulk.data?.errors?.length ? (
        <div className="card p-3 text-xs text-amber-300">
          Some rows failed:{" "}
          {bulk.data.errors.map((e: any, i) => (
            <span key={i}>
              #{e.id}: {e.reason};{" "}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2">
        {STATUSES.map((s) => (
          <Column
            key={s}
            label={STATUS_LABEL[s]}
            count={counts.data?.[s] ?? grouped[s].length}
            rows={grouped[s]}
            selected={selected}
            onToggle={toggleSel}
            onOpen={setDrawerId}
          />
        ))}
      </div>

      {drawerId && <Drawer id={drawerId} onClose={() => setDrawerId(null)} />}
    </div>
  );
}

function Column({
  label,
  count,
  rows,
  selected,
  onToggle,
  onOpen,
}: {
  label: string;
  count: number;
  rows: ImportedEvent[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="card p-3 flex flex-col gap-2 min-h-[300px]">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{label}</h3>
        <span className="text-[10px] text-muted">{count}</span>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto max-h-[70vh]">
        {rows.map((e) => (
          <li
            key={e.id}
            className={
              "rounded border p-2 text-xs space-y-1 cursor-pointer hover:bg-border/30 " +
              (selected.has(e.id) ? "border-accent" : "border-border")
            }
            onClick={() => onOpen(e.id)}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(e.id)}
                onChange={() => onToggle(e.id)}
                onClick={(ev) => ev.stopPropagation()}
              />
              <div className="font-medium leading-snug truncate flex-1">{e.title}</div>
            </div>
            <div className="text-muted truncate">
              {e.source_name}
              {e.venue_name ? ` · ${e.venue_name}` : ""}
            </div>
            {e.start_datetime && (
              <div className="text-muted tabular-nums">
                {new Date(e.start_datetime).toLocaleString()}
              </div>
            )}
            {e.matched_organisation_name && (
              <div className="text-accent truncate">→ {e.matched_organisation_name}</div>
            )}
          </li>
        ))}
        {!rows.length && <li className="text-xs py-3 text-center"><EmptyState message="Empty" shape="circle-aqua" /></li>}
      </ul>
    </div>
  );
}

function Drawer({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["import-detail", id],
    queryFn: () => api<any>(`/api/imports/${id}/`),
  });
  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-[min(560px,90vw)] bg-card border-l border-border overflow-y-auto p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Imported event #{id}</h3>
          <button onClick={onClose} className="btn-ghost text-xs">
            Close
          </button>
        </div>
        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.data && (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">{q.data.title}</div>
              <div className="text-xs text-muted">
                {q.data.source_name} · {q.data.external_id}
              </div>
            </div>
            {q.data.image_url && (
              <img 
                src={q.data.image_url} 
                alt={q.data.title}
                className="w-full max-h-40 object-cover rounded"
              />
            )}
            {q.data.start_datetime && (
              <div className="text-xs text-muted">
                {new Date(q.data.start_datetime).toLocaleString()} →{" "}
                {q.data.end_datetime
                  ? new Date(q.data.end_datetime).toLocaleString()
                  : "—"}
              </div>
            )}
            {q.data.description && (
              <p className="text-xs whitespace-pre-wrap">{q.data.description}</p>
            )}
            {q.data.source_url && (
              <a
                href={q.data.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent underline break-all"
              >
                {q.data.source_url}
              </a>
            )}
            {q.data.matched_event && (
              <div className="card p-2 text-xs">
                <div className="text-muted">Matched event</div>
                <Link
                  to={`/insights/events/${q.data.matched_event.id}`}
                  className="font-medium hover:text-accent hover:underline"
                >
                  {q.data.matched_event.title}
                </Link>
              </div>
            )}
            <details>
              <summary className="text-xs text-muted cursor-pointer">Raw payload</summary>
              <pre className="text-[10px] whitespace-pre-wrap bg-bg/50 p-2 rounded mt-1 max-h-72 overflow-auto">
                {JSON.stringify(q.data.raw_data, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}
