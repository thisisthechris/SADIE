import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useConfig } from "../lib/auth";
import Map2D, { type MapPoint, type MapPath } from "../viz/Map2D";
import OrgToggle from "../components/OrgToggle";
import InfoTooltip from "../components/InfoTooltip";

// ── Types ─────────────────────────────────────────────────────────────────

interface OrgNode {
  id: number;
  name: string;
  lat: number;
  lng: number;
  visit_count: number;
}

interface OrgFlow {
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  shared_visitors: number;
}

interface OrgConnectionsResp {
  node_count: number;
  flow_count: number;
  nodes: OrgNode[];
  flows: OrgFlow[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function OrgConnectionsMap() {
  const f = useFilters();
  const cfg = useConfig();
  const key = cfg.data?.maptiler_api_key ?? "";
  const q = f.asQuery();

  // When an org filter is active, show only that org + its connections by
  // default. Users can toggle to see the full network.
  const hasOrgFilter = Boolean(q.org);
  const [showAll, setShowAll] = useState(!hasOrgFilter);

  // Focused org IDs: starts as the filtered org (if set), expands when the
  // user clicks "Add" on a connected org in the table.
  const [focusedIds, setFocusedIds] = useState<Set<number>>(
    () => new Set(),
  );

  const data = useQuery({
    queryKey: ["org-connections", q],
    queryFn: () =>
      api<OrgConnectionsResp>("/api/analytics/viz/org-connections/", {
        query: q,
      }),
    staleTime: 5 * 60_000,
  });

  const nodes = data.data?.nodes ?? [];
  const flows = data.data?.flows ?? [];

  // How many orgs Simple view shows by default when no org filter/manual
  // selection is active. Fixed (not expanded via connections) so it stays
  // visibly distinct from "Show all" even with a small/densely-connected
  // dataset — connection-based 1-hop expansion used to swallow almost the
  // whole graph in test data with only a handful of organisations.
  const SIMPLE_VIEW_TOP_N = 5;

  // Determine which org IDs are "in view" for the focused / simple mode.
  const viewIds = useMemo((): Set<number> | null => {
    if (showAll) return null; // null = all visible

    // Seed from the API org filter org IDs if available, then add any
    // manually added focused IDs ("Add organisations" panel).
    const seed: Set<number> = new Set(focusedIds);
    if (hasOrgFilter && nodes.length > 0) {
      // The filtered org is already the only org returned by the API when
      // org= is set, so just include all returned nodes in focused mode too.
      nodes.forEach((n) => seed.add(n.id));
    }
    if (seed.size === 0 && nodes.length > 0) {
      // No filter and nothing manually added yet: default to the top N orgs
      // by visit count — a fixed, curated baseline rather than expanding to
      // every neighbour, so Simple view stays meaningfully smaller than
      // Show all regardless of how interconnected the dataset is.
      nodes.slice(0, SIMPLE_VIEW_TOP_N).forEach((n) => seed.add(n.id));
    }

    return seed;
  }, [showAll, focusedIds, nodes, hasOrgFilter]);

  const visibleNodes = useMemo(
    () => (viewIds ? nodes.filter((n) => viewIds.has(n.id)) : nodes),
    [nodes, viewIds],
  );

  const visibleFlows = useMemo(
    () =>
      viewIds
        ? flows.filter(
            (fl) => viewIds.has(fl.from_id) && viewIds.has(fl.to_id),
          )
        : flows,
    [flows, viewIds],
  );

  // Map primitives
  const maxVisits = Math.max(1, ...visibleNodes.map((n) => n.visit_count));
  const maxShared = Math.max(1, ...visibleFlows.map((fl) => fl.shared_visitors));

  const mapPoints: MapPoint[] = useMemo(
    () =>
      visibleNodes.map((n) => ({
        id: n.id,
        lng: n.lng,
        lat: n.lat,
        weight: 1 + (n.visit_count / maxVisits) * 3,
        color: "#3b82f6",
        popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
          n.name,
        )}</div><div>${n.visit_count.toLocaleString()} visits</div></div>`,
      })),
    [visibleNodes, maxVisits],
  );

  const mapPaths: MapPath[] = useMemo(
    () =>
      visibleFlows.map((fl) => {
        const a = nodes.find((n) => n.id === fl.from_id);
        const b = nodes.find((n) => n.id === fl.to_id);
        if (!a || !b) return null as unknown as MapPath;
        const frac = fl.shared_visitors / maxShared;
        return {
          id: `${fl.from_id}-${fl.to_id}`,
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ] as [number, number][],
          color: "#3b82f6",
          width: 1 + frac * 8,
          opacity: 0.2 + frac * 0.65,
          popupHtml: `<div class="text-xs"><div class="font-semibold">${escapeHtml(
            fl.from_name,
          )} → ${escapeHtml(fl.to_name)}</div><div>${fl.shared_visitors.toLocaleString()} shared visitor${
            fl.shared_visitors === 1 ? "" : "s"
          }</div></div>`,
        };
      }).filter(Boolean),
    [visibleFlows, nodes, maxShared],
  );

  // Orgs not yet in the focused view — shown in the "add" panel.
  const addableOrgs = useMemo(() => {
    if (showAll) return [];
    return nodes.filter((n) => viewIds && !viewIds.has(n.id));
  }, [nodes, viewIds, showAll]);

  function addOrg(id: number) {
    setFocusedIds((prev) => new Set([...prev, id]));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="heading-main">Org Connections</h1>
            <InfoTooltip text="Shows which organisations share visitors — the thicker the line, the more people visited both. Positions reflect each organisation's venues." />
          </div>
          <p className="body-lg">
            Organisations whose visitors overlap, placed at their venue
            locations. Simple view starts with the top {SIMPLE_VIEW_TOP_N} busiest
            organisations — add more from the panel below, or switch to "Show
            all" for the full network.
          </p>
        </div>

        {/* Simple / full toggle */}
        <div className="flex items-center gap-2">
          <OrgToggle />
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 ${!showAll ? "bg-accent text-white" : "hover:bg-border/20"}`}
              onClick={() => setShowAll(false)}
            >
              Simple view
            </button>
            <button
              className={`px-3 py-1.5 ${showAll ? "bg-accent text-white" : "hover:bg-border/20"}`}
              onClick={() => setShowAll(true)}
            >
              Show all
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {data.data && (
        <p className="text-xs text-muted">
          {visibleNodes.length} organisation{visibleNodes.length === 1 ? "" : "s"} ·{" "}
          {visibleFlows.length} connection{visibleFlows.length === 1 ? "" : "s"}
          {!showAll && data.data.node_count > visibleNodes.length && (
            <> · {data.data.node_count - visibleNodes.length} more hidden</>
          )}
        </p>
      )}

      {/* Map */}
      {!key ? (
        <div className="card p-6 text-sm text-muted">
          MapTiler key missing — set{" "}
          <code className="font-mono">MAPTILER_API_KEY</code> and restart the
          web service.
        </div>
      ) : data.isLoading ? (
        <div className="card p-6 text-sm text-muted">Loading connections…</div>
      ) : (
        <div className="card overflow-hidden">
          <Map2D
            points={mapPoints}
            paths={mapPaths}
            maptilerKey={key}
            height="55vh"
          />
        </div>
      )}

      {/* "Add organisations" panel — only in simple view */}
      {!showAll && addableOrgs.length > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="heading-sub text-xs">Add organisations to view</h2>
          <div className="flex flex-wrap gap-2">
            {addableOrgs.slice(0, 30).map((n) => (
              <button
                key={n.id}
                onClick={() => addOrg(n.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-border hover:bg-border/30 transition-colors"
              >
                + {n.name}
                <span className="text-muted">({n.visit_count})</span>
              </button>
            ))}
            {addableOrgs.length > 30 && (
              <span className="text-xs text-muted self-center">
                +{addableOrgs.length - 30} more — switch to "Show all" to see
                the full network
              </span>
            )}
          </div>
        </div>
      )}

      {/* Connections table */}
      <ConnectionsTable flows={visibleFlows} loading={data.isLoading} />
    </div>
  );
}

// ── Connections ranked table ───────────────────────────────────────────────

function ConnectionsTable({
  flows,
  loading,
}: {
  flows: OrgFlow[];
  loading: boolean;
}) {
  if (loading) return <div className="text-xs text-muted">Loading…</div>;
  if (!flows.length)
    return (
      <div className="text-xs text-muted">
        No cross-organisation visitor movements for the current filters.
      </div>
    );

  const max = Math.max(...flows.map((r) => r.shared_visitors), 1);

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="heading-sub">Top connections</h2>
        <InfoTooltip text="Number of individual visitors who attended events at both organisations." />
      </div>
      <ol className="space-y-1.5">
        {flows.slice(0, 25).map((r) => (
          <li key={`${r.from_id}-${r.to_id}`} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="truncate">
                {r.from_name}{" "}
                <span className="text-muted">→</span>{" "}
                {r.to_name}
              </span>
              <span className="tabular-nums text-muted shrink-0">
                {r.shared_visitors.toLocaleString()}
              </span>
            </div>
            <div className="h-1 bg-border/50 rounded mt-1">
              <div
                className="h-1 bg-accent rounded"
                style={{
                  width: `${(r.shared_visitors / max) * 100}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
