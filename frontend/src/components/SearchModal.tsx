import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import EmptyState from "./EmptyState";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TypeFilter = "all" | "event" | "organisation";

interface SearchHit {
  type: "event" | "organisation";
  id: number;
  title: string;
  snippet?: string;
  score: number;
  url: string;
  start_datetime?: string | null;
  organisation?: { id: number; name: string };
  location?: { id: number; name: string } | null;
}

interface SearchResponse {
  query: string;
  vector: boolean;
  results: SearchHit[];
}

const STATIC_PAGES = [
  { label: "Overview", to: "/" },
  { label: "Map", to: "/map" },
  { label: "Calendar", to: "/calendar" },
  { label: "Organisations", to: "/organisations" },
  { label: "Postcodes", to: "/postcodes" },
  { label: "Network", to: "/network" },
  { label: "Journeys", to: "/journeys" },
];

export default function SearchModal({ open, onClose }: Props) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (open) {
      setQ("");
      setTypeFilter("all");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const search = useQuery({
    queryKey: ["search-modal", q, typeFilter],
    enabled: open && q.trim().length > 1,
    queryFn: () =>
      api<SearchResponse>("/api/search/", {
        query: {
          q: q.trim(),
          limit: 20,
          ...(typeFilter !== "all" ? { types: typeFilter } : {}),
        },
      }),
  });

  const filteredHits: SearchHit[] = (search.data?.results ?? []).filter(
    (r) => typeFilter === "all" || r.type === typeFilter
  );

  const staticMatches =
    q.trim().length < 2
      ? STATIC_PAGES.filter((p) =>
          !q || p.label.toLowerCase().includes(q.toLowerCase())
        )
      : [];

  const navigate = (to: string) => {
    nav(to);
    onClose();
  };

  const hitCount = staticMatches.length + filteredHits.length;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hitCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (active < staticMatches.length) {
        navigate(staticMatches[active].to);
      } else {
        const hit = filteredHits[active - staticMatches.length];
        if (hit) navigate(hitTo(hit));
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl card overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKey}
            placeholder="Search events, organisations…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {search.isFetching && (
            <span className="text-[10px] text-muted">searching…</span>
          )}
          <kbd className="text-[10px] text-muted border border-border rounded px-1">esc</kbd>
        </div>

        {/* Type filter chips */}
        {q.trim().length > 1 && (
          <div className="flex gap-2 px-4 py-2 border-b border-border">
            {(["all", "event", "organisation"] as TypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); setActive(0); }}
                className={
                  "text-xs px-3 py-1 rounded-full border transition-colors " +
                  (typeFilter === t
                    ? "bg-accent text-white border-accent"
                    : "border-border text-muted hover:border-accent/60")
                }
              >
                {t === "all" ? "All" : t === "event" ? "Events" : "Organisations"}
              </button>
            ))}
            {search.data && (
              <span className="ml-auto text-xs text-muted self-center">
                {filteredHits.length} result{filteredHits.length !== 1 ? "s" : ""}
                {search.data.vector && (
                  <span className="ml-1 text-accent/70">· vector</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Results */}
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {/* Static page shortcuts */}
          {staticMatches.length > 0 && (
            <>
              <li className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted">
                Pages
              </li>
              {staticMatches.map((p, i) => (
                <li
                  key={p.to}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => navigate(p.to)}
                  className={
                    "px-4 py-2 text-sm cursor-pointer flex items-center gap-3 " +
                    (i === active ? "bg-border/40" : "hover:bg-border/20")
                  }
                >
                  <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">
                    page
                  </span>
                  <span>{p.label}</span>
                </li>
              ))}
            </>
          )}

          {/* Remote search results */}
          {filteredHits.length > 0 && (
            <>
              {staticMatches.length > 0 && (
                <li className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-muted border-t border-border mt-1">
                  Results
                </li>
              )}
              {filteredHits.map((hit, i) => {
                const idx = staticMatches.length + i;
                return (
                  <li
                    key={`${hit.type}-${hit.id}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => navigate(hitTo(hit))}
                    className={
                      "px-4 py-2.5 text-sm cursor-pointer flex items-start gap-3 " +
                      (idx === active ? "bg-border/40" : "hover:bg-border/20")
                    }
                  >
                    <span
                      className={
                        "text-[10px] uppercase tracking-wider w-16 shrink-0 mt-0.5 " +
                        (hit.type === "event" ? "text-blue-400" : "text-green-400")
                      }
                    >
                      {hit.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{hit.title}</div>
                      <div className="text-xs text-muted truncate mt-0.5">
                        {hit.type === "event" ? (
                          <>
                            {hit.organisation?.name}
                            {hit.location?.name && (
                              <span> · {hit.location.name}</span>
                            )}
                            {hit.start_datetime && (
                              <span>
                                {" "}
                                · {new Date(hit.start_datetime).toLocaleDateString()}
                              </span>
                            )}
                          </>
                        ) : (
                          hit.snippet
                        )}
                      </div>
                    </div>
                    {hit.score > 0 && (
                      <span className="text-[10px] text-muted/60 shrink-0 mt-0.5">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </li>
                );
              })}
            </>
          )}

          {/* Empty states */}
          {q.trim().length > 1 && !search.isFetching && filteredHits.length === 0 && (
            <li className="px-4 py-6">
              <EmptyState message={`No results for \"${q}\"`} shape="halfmoon-yellow" />
            </li>
          )}
          {q.trim().length <= 1 && staticMatches.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted text-center">
              Start typing to search…
            </li>
          )}
        </ul>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted flex items-center gap-4">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}

function hitTo(hit: SearchHit): string {
  if (hit.type === "event") return `/events/${hit.id}`;
  return `/organisations?org=${hit.id}`;
}
