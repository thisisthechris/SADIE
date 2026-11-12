import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, UploadCloud, Undo2, CheckCircle2, AlertTriangle, FileWarning } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { UPLOAD } from "../lib/copy";
import { FORMATS, type UploadRow } from "../lib/upload/formats";
import { chunk, fileFingerprint, type Prepared } from "../lib/upload/prepare";
import { prepareInWorker } from "../lib/upload/runPrepare";
import { bucketLabel, toIsoDate } from "../lib/filters";
import { useMe } from "../lib/auth";
import DataCalendar from "../components/DataCalendar";
import BrandShape from "../components/BrandShape";
import { Confetti, HashScramble } from "../components/UploadFx";

const CHUNK_SIZE = 1000;

interface Batch {
  id: number;
  organisation: number;
  organisation_name: string;
  uploaded_by: string | null;
  source_format: string;
  file_fingerprint: string;
  file_label: string;
  status: "in_progress" | "complete" | "undone";
  row_count: number;
  skipped_count: number;
  interaction_count: number;
  date_from: string | null;
  date_to: string | null;
  created_at: string;
}

type Stage =
  | { kind: "idle" }
  | { kind: "reading"; done: number; total: number }
  | { kind: "unrecognised"; header: string[] }
  | { kind: "ready"; prepared: Prepared; fingerprint: string; fileName: string; duplicate?: Batch }
  | { kind: "uploading"; prepared: Prepared; sent: number }
  | { kind: "done"; batch: Batch }
  | { kind: "error"; message: string };

const STEP_FOR: Record<Stage["kind"], number> = {
  idle: 1,
  reading: 1,
  unrecognised: 1,
  ready: 2,
  uploading: 3,
  done: 4,
  error: 2,
};

/** Monday dates of every week a date range touches, for the calendar pop-in. */
function weeksBetween(from: string | null, to: string | null): Set<string> {
  const out = new Set<string>();
  if (!from || !to) return out;
  const [y, m, d] = from.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  while (toIsoDate(cur) <= to) {
    out.add(toIsoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body) {
    return String((e.body as { detail: unknown }).detail);
  }
  return "Something went wrong. Please try again.";
}

export default function Upload() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const orgs = useQuery({
    queryKey: ["upload-orgs"],
    queryFn: () => api<{ results: { id: number; name: string }[] }>("/api/uploads/organisations/"),
  });
  const [orgId, setOrgId] = useState<string>("");
  const effectiveOrg = orgId || (orgs.data?.results.length === 1 ? String(orgs.data.results[0].id) : "");

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["uploads", effectiveOrg],
    queryFn: () => api<{ results: Batch[] }>("/api/uploads/", { query: { org: effectiveOrg } }),
    enabled: Boolean(effectiveOrg),
  });

  const handleFile = async (file: File) => {
    setStage({ kind: "reading", done: 0, total: 0 });
    try {
      const bytes = await file.arrayBuffer();
      const [fingerprint, result] = await Promise.all([
        fileFingerprint(bytes),
        prepareInWorker(new TextDecoder().decode(bytes), (done, total) =>
          setStage({ kind: "reading", done, total }),
        ),
      ]);
      if (!result.ok) return setStage({ kind: "unrecognised", header: result.header });
      const duplicate = history.data?.results.find((b) => b.status !== "undone" && b.file_fingerprint === fingerprint);
      setStage({ kind: "ready", prepared: result.prepared, fingerprint, fileName: file.name, duplicate });
    } catch {
      setStage({ kind: "error", message: "We couldn't read that file. Is it a CSV export?" });
    }
  };

  const upload = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      if (stage.kind !== "ready") throw new Error("nothing to upload");
      const { prepared, fingerprint, fileName } = stage;
      const batch = await api<Batch>("/api/uploads/", {
        method: "POST",
        body: {
          organisation: Number(effectiveOrg),
          source_format: prepared.format.label,
          file_fingerprint: fingerprint,
          file_label: fileName.slice(0, 120),
          skipped_count: prepared.skippedCount,
          force,
        },
      });
      setStage({ kind: "uploading", prepared, sent: 0 });
      let sent = 0;
      for (const rows of chunk<UploadRow>(prepared.rows, CHUNK_SIZE)) {
        await api(`/api/uploads/${batch.id}/rows/`, { method: "POST", body: { rows } });
        sent += rows.length;
        setStage({ kind: "uploading", prepared, sent });
      }
      return api<Batch>(`/api/uploads/${batch.id}/complete/`, { method: "POST" });
    },
    onSuccess: (batch) => {
      setStage({ kind: "done", batch });
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["data-calendar"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && stage.kind === "ready") {
        const duplicate = (e.body as { duplicate_of?: Batch }).duplicate_of;
        setStage({ ...stage, duplicate });
        return;
      }
      setStage({ kind: "error", message: errorMessage(e) });
    },
  });

  const undo = useMutation({
    mutationFn: (id: number) => api<Batch>(`/api/uploads/${id}/undo/`, { method: "POST" }),
    onSuccess: () => {
      setStage({ kind: "idle" });
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["data-calendar"] });
    },
  });

  const freshWeeks = useMemo(
    () => (stage.kind === "done" ? weeksBetween(stage.batch.date_from, stage.batch.date_to) : undefined),
    [stage],
  );
  const step = effectiveOrg ? STEP_FOR[stage.kind] : 0;
  const reset = () => setStage({ kind: "idle" });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="heading-main mb-2">{UPLOAD.title}</h1>
        <p className="body-lg">{UPLOAD.intro}</p>
      </div>

      <StepTracker current={step} />

      {orgs.data && orgs.data.results.length === 0 ? (
        <div className="card p-6 text-sm text-muted">{UPLOAD.noOrgs}</div>
      ) : (
        <div className="card p-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium" htmlFor="upload-org">
            Organisation
          </label>
          <select
            id="upload-org"
            className="input max-w-xs"
            value={effectiveOrg}
            onChange={(e) => {
              setOrgId(e.target.value);
              reset();
            }}
          >
            <option value="">Choose…</option>
            {orgs.data?.results.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {effectiveOrg && (
        <>
          {(stage.kind === "idle" || stage.kind === "unrecognised" || stage.kind === "error") && (
            <>
              <DropZone
                dragging={dragging}
                setDragging={setDragging}
                onFile={handleFile}
                inputRef={inputRef}
              />
              {stage.kind === "unrecognised" && <Unrecognised header={stage.header} />}
              {stage.kind === "error" && <Notice tone="error" title={stage.message} />}
            </>
          )}

          {stage.kind === "reading" && (
            <div className="card p-8 text-center space-y-4">
              <div className="flex justify-center animate-bounce-soft">
                <BrandShape name="cogarm-blue" size={56} opacity={0.9} className="animate-spin [animation-duration:3s]" />
              </div>
              <p className="font-medium">{stage.total ? UPLOAD.crunching(stage.total) : UPLOAD.readingFile}</p>
              <Progress value={stage.total ? stage.done / stage.total : 0} />
              <p className="text-xs text-muted flex items-center justify-center gap-1">
                <Lock className="w-3.5 h-3.5" /> {UPLOAD.privacyLine}
              </p>
            </div>
          )}

          {stage.kind === "ready" && (
            <ReadyCard
              stage={stage}
              busy={upload.isPending}
              onUpload={(force) => upload.mutate({ force })}
              onCancel={reset}
            />
          )}

          {stage.kind === "uploading" && (
            <div className="card p-8 text-center space-y-4">
              <div className="flex justify-center animate-bounce-soft">
                <UploadCloud className="w-12 h-12 text-accent" />
              </div>
              <p className="font-medium">{UPLOAD.uploading(stage.sent, stage.prepared.rows.length)}</p>
              <Progress value={stage.sent / Math.max(stage.prepared.rows.length, 1)} />
            </div>
          )}

          {stage.kind === "done" && (
            <div className="card p-8 text-center space-y-4 relative overflow-visible">
              <Confetti />
              <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto animate-pop-in" />
              <h2 className="heading-small">{UPLOAD.doneTitle}</h2>
              <p className="text-sm text-muted">
                {UPLOAD.doneLine(stage.batch.interaction_count, freshWeeks?.size ?? 0)}
              </p>
              <div className="flex justify-center gap-3 flex-wrap">
                <button className="btn-primary" onClick={reset}>
                  {UPLOAD.another}
                </button>
                <button
                  className="btn-ghost border border-border inline-flex items-center gap-1"
                  disabled={undo.isPending}
                  onClick={() => window.confirm(UPLOAD.undoConfirm) && undo.mutate(stage.batch.id)}
                >
                  <Undo2 className="w-4 h-4" /> {UPLOAD.undo}
                </button>
              </div>
            </div>
          )}

          <DataCalendar orgId={effectiveOrg} highlight={freshWeeks} />

          <History
            batches={history.data?.results ?? []}
            canUndo={(b) => Boolean(me?.is_staff) || b.uploaded_by === me?.username}
            onUndo={(b) => window.confirm(UPLOAD.undoConfirm) && undo.mutate(b.id)}
          />
        </>
      )}
    </div>
  );
}

function StepTracker({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs flex-wrap" aria-label="Upload steps">
      {UPLOAD.steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full grid place-items-center font-semibold transition-all duration-300 ${
                state === "done"
                  ? "bg-accent text-white scale-100"
                  : state === "active"
                    ? "bg-pink-500 text-white scale-110 animate-bounce-soft"
                    : "bg-border/40 text-muted"
              }`}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={state === "todo" ? "text-muted" : "font-medium"}>{label}</span>
            {i < UPLOAD.steps.length - 1 && (
              <span
                className={`w-8 h-0.5 rounded transition-colors duration-500 ${i < current ? "bg-accent" : "bg-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DropZone({
  dragging,
  setDragging,
  onFile,
  inputRef,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`relative w-full overflow-hidden rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
        dragging
          ? "border-pink-400 bg-pink-50 shadow-lg animate-wobble"
          : "border-border hover:border-accent/60 hover:bg-accent/5"
      }`}
    >
      <span className="absolute left-6 top-4 animate-float-slow" aria-hidden>
        <BrandShape name="cog-pink" size={dragging ? 44 : 32} opacity={dragging ? 0.6 : 0.25} />
      </span>
      <span className="absolute right-8 bottom-4 animate-float-slow [animation-delay:1.2s]" aria-hidden>
        <BrandShape name="halfmoon-yellow" size={dragging ? 40 : 28} opacity={dragging ? 0.6 : 0.25} />
      </span>
      <UploadCloud
        className={`mx-auto mb-3 w-12 h-12 transition-transform duration-200 ${
          dragging ? "text-pink-500 -translate-y-1 scale-110" : "text-accent"
        }`}
      />
      <div className="font-semibold">{dragging ? UPLOAD.dropActive : UPLOAD.dropTitle}</div>
      <p className="text-sm text-muted mt-1 max-w-md mx-auto">{UPLOAD.dropHint}</p>
      <p className="text-xs text-muted mt-3 flex items-center justify-center gap-1">
        <Lock className="w-3.5 h-3.5" /> {UPLOAD.privacyLine}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </button>
  );
}

function ReadyCard({
  stage,
  busy,
  onUpload,
  onCancel,
}: {
  stage: Extract<Stage, { kind: "ready" }>;
  busy: boolean;
  onUpload: (force: boolean) => void;
  onCancel: () => void;
}) {
  const p = stage.prepared;
  const sent = p.header.filter((h) => !p.format.personalColumns.includes(h));
  return (
    <div className="card p-6 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Recognised as</div>
          <div className="heading-small">{p.format.label}</div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="Bookings" value={p.rows.length} />
          <Stat label="Attendees" value={p.attendees} />
          <Stat label="Skipped" value={p.skippedCount} />
        </div>
      </div>

      {p.dateFrom && (
        <p className="text-sm">
          Covers <strong>{bucketLabel(p.dateFrom, "week")}</strong> to{" "}
          <strong>{bucketLabel(p.dateTo ?? p.dateFrom, "week")}</strong>.
        </p>
      )}

      {p.skippedCount > 0 && (
        <Notice
          tone="warn"
          title={`${p.skippedCount} row${p.skippedCount === 1 ? "" : "s"} will be skipped`}
          body={Object.entries(p.skipped)
            .map(([why, n]) => `${n} ${why}`)
            .join(" · ")}
        />
      )}

      <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Lock className="w-4 h-4 text-accent" /> {UPLOAD.privacyTitle}
        </div>
        {p.hashExamples.map((ex) => (
          <HashScramble key={ex.hash} from={ex.masked} to={ex.hash} />
        ))}
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
          <span className="text-muted">{UPLOAD.staysHere}:</span>
          {p.format.personalColumns.map((c) => (
            <span key={c} className="rounded-full bg-pink-100 text-pink-700 px-2 py-0.5 line-through">
              {c}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-muted">Used:</span>
          {sent.map((c) => (
            <span key={c} className="rounded-full bg-accent/10 text-accent px-2 py-0.5">
              {c}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{UPLOAD.previewTitle}</summary>
        <p className="text-xs text-muted my-2">{UPLOAD.previewHint}</p>
        <pre className="text-[11px] bg-border/20 rounded p-3 overflow-auto max-h-64">
          {JSON.stringify(p.rows.slice(0, 3), null, 2)}
        </pre>
      </details>

      {stage.duplicate && (
        <Notice
          tone="warn"
          title={UPLOAD.duplicateTitle}
          body={`${UPLOAD.duplicateHint} Previously uploaded ${new Date(stage.duplicate.created_at).toLocaleString("en-GB")}${
            stage.duplicate.uploaded_by ? ` by ${stage.duplicate.uploaded_by}` : ""
          }.`}
        />
      )}

      <div className="flex gap-3 flex-wrap">
        <button className="btn-primary" disabled={busy || !p.rows.length} onClick={() => onUpload(Boolean(stage.duplicate))}>
          {stage.duplicate ? "Upload anyway" : `Upload ${p.rows.length.toLocaleString()} bookings`}
        </button>
        <button className="btn-ghost border border-border" onClick={onCancel} disabled={busy}>
          Choose a different file
        </button>
      </div>
    </div>
  );
}

function Unrecognised({ header }: { header: string[] }) {
  return (
    <div className="card p-5 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 font-medium">
        <FileWarning className="w-5 h-5 text-amber-500" /> {UPLOAD.unrecognisedTitle}
      </div>
      <p className="text-xs text-muted">Your file's columns: {header.join(", ") || "(none found)"}</p>
      <p className="text-sm">{UPLOAD.unrecognisedHint}</p>
      <ul className="text-xs space-y-1">
        {FORMATS.map((f) => (
          <li key={f.id}>
            <strong>{f.label}:</strong> <span className="text-muted">{f.header.join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({
  batches,
  canUndo,
  onUndo,
}: {
  batches: Batch[];
  canUndo: (b: Batch) => boolean;
  onUndo: (b: Batch) => void;
}) {
  if (!batches.length) return null;
  return (
    <section className="card p-5">
      <h2 className="heading-small mb-3">{UPLOAD.historyTitle}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted text-xs">
            <th className="py-1.5 font-medium">When</th>
            <th className="py-1.5 font-medium">Format</th>
            <th className="py-1.5 font-medium">Covers</th>
            <th className="py-1.5 font-medium text-right">Bookings</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {batches.map((b) => (
            <tr key={b.id} className={b.status === "undone" ? "text-muted line-through" : ""}>
              <td className="py-2">
                {new Date(b.created_at).toLocaleDateString("en-GB")}
                {b.uploaded_by && <span className="text-muted"> · {b.uploaded_by}</span>}
              </td>
              <td className="py-2">{b.source_format}</td>
              <td className="py-2">
                {b.date_from ? `${b.date_from} → ${b.date_to}` : b.status === "in_progress" ? "unfinished" : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">{b.interaction_count.toLocaleString()}</td>
              <td className="py-2 text-right">
                {b.status === "complete" && canUndo(b) && (
                  <button className="btn-ghost text-xs" onClick={() => onUndo(b)}>
                    Undo
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-bold text-accent tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted uppercase">{label}</div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-border/40 overflow-hidden max-w-md mx-auto">
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-pink-500 transition-[width] duration-300"
        style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }}
      />
    </div>
  );
}

function Notice({ tone, title, body }: { tone: "warn" | "error"; title: string; body?: string }) {
  return (
    <div
      className={`rounded-lg p-3 text-sm flex gap-2 ${
        tone === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        {body && <div className="text-xs mt-0.5">{body}</div>}
      </div>
    </div>
  );
}
