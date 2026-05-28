import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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

type TypeFilter = "all" | "event" | "organisation";

const FILTER_LABELS: Record<TypeFilter, string> = {
  all: "All",
  event: "Events",
  organisation: "Organisations",
};

/**
 * Hybrid search page powered by /api/search/.
 *
 * Combines Postgres FTS, pg_trgm fuzzy matching, and pgvector cosine
 * similarity over local fastembed embeddings.
 */
export default function Search() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TypeFilter>("all");

  const search = useQuery({
    queryKey: ["search", q],
    enabled: q.trim().length > 1,
    queryFn: () =>
      api<SearchResponse>("/api/search/", {
        query: { q: q.trim(), limit: 50 },
      }),
  });

  const all = search.data?.results ?? [];
  const results =
    filter === "all" ? all : all.filter((r) => r.type === filter);
  const counts = {
    all: all.length,
    event: all.filter((r) => r.type === "event").length,
    organisation: all.filter((r) => r.type === "organisation").length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-muted">
          Hybrid keyword + semantic search across events and organisations.
          {search.data?.vector === false && (
            <span className="ml-1 text-amber-500">
              (vector index unavailable — keyword only)
            </span>
          )}
        </p>
      </div>

      <div className="card p-3 space-y-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try: outdoor family friendly, evening jazz, free workshops…"
          className="w-full px-3 py-2 bg-transparent border border-border rounded outline-none text-sm focus:ring-1 focus:ring-accent"
        />
        <div className="flex items-center gap-2 text-xs">
          {(Object.keys(FILTER_LABELS) as TypeFilter[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                "px-2 py-1 rounded border " +
                (filter === k
                  ? "bg-accent text-white border-accent"
                  : "border-border hover:bg-border/40")
              }
            >
              {FILTER_LABELS[k]}{" "}
              <span className="opacity-60">
                {q.length > 1 ? counts[k] : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {q.trim().length <= 1 && (
        <div className="card p-6 text-sm text-muted text-center">
          Start typing to search. Results blend full-text rank, fuzzy
          (trigram) similarity and semantic vector similarity.
        </div>
      )}

      {search.isLoading && q.trim().length > 1 && (
        <div className="card p-4 text-sm text-muted">Searching…</div>
      )}

      {search.data && results.length === 0 && q.trim().length > 1 && (
        <div className="card p-4 text-sm text-muted">No matches.</div>
      )}

      <div className="card divide-y divide-border">
        {results.map((r) => (
          <SearchRow key={`${r.type}-${r.id}`} hit={r} />
        ))}
      </div>
    </div>
  );
}

function SearchRow({ hit }: { hit: SearchHit }) {
  const to =
    hit.type === "event"
      ? `/calendar?event=${hit.id}`
      : `/organisations?org=${hit.id}`;
  return (
    <Link to={to} className="block p-4 hover:bg-border/30 transition">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center w-14 flex-shrink-0">
          <span
            className={
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded " +
              (hit.type === "event"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-emerald-500/15 text-emerald-400")
            }
          >
            {hit.type}
          </span>
          <span
            className="mt-1 text-[10px] text-muted tabular-nums"
            title={`Hybrid score: ${hit.score.toFixed(3)}`}
          >
            {hit.score.toFixed(2)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{hit.title}</div>
          <div className="text-xs text-muted truncate">
            {hit.type === "event" && hit.organisation?.name}
            {hit.type === "event" && hit.location?.name && (
              <> · {hit.location.name}</>
            )}
            {hit.type === "event" && hit.start_datetime && (
              <> · {new Date(hit.start_datetime).toLocaleDateString()}</>
            )}
          </div>
          {hit.snippet && (
            <p className="text-sm text-muted line-clamp-2 mt-1">
              {hit.snippet}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
