import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Hit {
  type: "event" | "organisation" | "page";
  label: string;
  sub?: string;
  to: string;
  score?: number;
}

interface SearchHit {
  type: "event" | "organisation";
  id: number;
  title: string;
  snippet?: string;
  score: number;
  url: string;
  start_datetime?: string | null;
  organisation?: { id: number; name: string };
}

interface SearchResponse {
  query: string;
  vector: boolean;
  results: SearchHit[];
}

const STATIC_PAGES: Hit[] = [
  { type: "page", label: "Overview", to: "/" },
  { type: "page", label: "Map", to: "/map" },
  { type: "page", label: "Calendar", to: "/calendar" },
  { type: "page", label: "Organisations", to: "/organisations" },
];

/**
 * Global Cmd-K command palette.
 *
 * Powered by `/api/search/` — hybrid Postgres FTS + pg_trgm + pgvector
 * cosine similarity over Events and Organisations.
 */
export default function CommandMenu({ open, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const search = useQuery({
    queryKey: ["cmdk-search", q],
    enabled: open && q.length > 1,
    queryFn: () =>
      api<SearchResponse>("/api/search/", {
        query: { q, limit: 10 },
      }),
  });

  const remoteHits: Hit[] = (search.data?.results ?? []).map((r) => ({
    type: r.type,
    label: r.title,
    sub:
      r.type === "event"
        ? `${r.organisation?.name ?? ""}${
            r.start_datetime
              ? ` · ${new Date(r.start_datetime).toLocaleDateString()}`
              : ""
          }`
        : r.snippet,
    to:
      r.type === "event"
        ? `/events/${r.id}`
        : `/organisations?org=${r.id}`,
    score: r.score,
  }));

  const hits: Hit[] = [
    ...STATIC_PAGES.filter(
      (p) => !q || p.label.toLowerCase().includes(q.toLowerCase())
    ),
    ...remoteHits,
  ];

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const h = hits[active];
      if (h) {
        nav(h.to);
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Search events, organisations, or jump to a page…"
          className="w-full px-4 py-3 bg-transparent border-b border-border outline-none text-sm"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {hits.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No results.</li>
          )}
          {hits.map((h, i) => (
            <li
              key={`${h.type}-${h.to}-${i}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                nav(h.to);
                onClose();
              }}
              className={
                "px-4 py-2 text-sm cursor-pointer flex items-center gap-3 " +
                (i === active ? "bg-border/40" : "")
              }
            >
              <span className="text-[10px] uppercase tracking-wider text-muted w-12">
                {h.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate">{h.label}</div>
                {h.sub && (
                  <div className="text-xs text-muted truncate">{h.sub}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
