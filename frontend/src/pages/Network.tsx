import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
// 3d-force-graph ships a UMD-style default export; types are loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ForceGraph3D from "3d-force-graph";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";

interface Node {
  id: string;
  type: "organisation" | "category" | "user_cluster";
  label: string;
  weight?: number;
}
interface Link {
  source: string;
  target: string;
  type: "org_category" | "org_user";
  value: number;
}
interface Resp {
  buckets: number;
  node_count: number;
  link_count: number;
  nodes: Node[];
  links: Link[];
}

const TYPE_COLOUR: Record<Node["type"], string> = {
  organisation: "#7dd3fc",
  category: "#fbbf24",
  user_cluster: "#a78bfa",
};

const TYPES: Node["type"][] = ["organisation", "category", "user_cluster"];

export default function Network() {
  const f = useFilters();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [enabled, setEnabled] = useState<Record<Node["type"], boolean>>({
    organisation: true,
    category: true,
    user_cluster: true,
  });
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const q = useQuery({
    queryKey: ["viz-network", f.asQuery()],
    queryFn: () =>
      api<Resp>("/api/analytics/viz/network/", { query: { ...f.asQuery(), buckets: "16" } }),
  });

  // Bootstrap the 3d-force-graph instance once.
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (ForceGraph3D as any)()(containerRef.current)
      .backgroundColor("#0b0d10")
      .nodeLabel((n: Node) => `${n.type}: ${n.label}`)
      .nodeColor((n: Node) => TYPE_COLOUR[n.type])
      .nodeVal((n: Node) => (n.type === "user_cluster" ? Math.max(2, Math.log2((n.weight ?? 1) + 1)) : 4))
      .linkOpacity(0.4)
      .linkColor(() => "#475569")
      .linkWidth((l: Link) => Math.min(4, Math.log2(l.value + 1)))
      .enableNodeDrag(false);
    if (reduceMotion) g.cooldownTicks(0);
    graphRef.current = g;
    const onResize = () => {
      const el = containerRef.current;
      if (!el || !graphRef.current) return;
      graphRef.current.width(el.clientWidth).height(el.clientHeight);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      graphRef.current?._destructor?.();
      graphRef.current = null;
    };
  }, [reduceMotion]);

  // Push filtered data into the graph.
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !q.data) return;
    const nodes = q.data.nodes.filter((n) => enabled[n.type]);
    const allowed = new Set(nodes.map((n) => n.id));
    const links = q.data.links.filter(
      (l) => allowed.has(l.source) && allowed.has(l.target)
    );
    g.graphData({ nodes, links });
  }, [q.data, enabled]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Network</h1>
        <p className="text-sm text-muted">
          Tripartite graph linking organisations to categories and to anonymised
          user clusters (MD5-bucketed user hashes). Toggle node types below.
        </p>
      </div>
      <FilterBar />
      <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
        {TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled[t]}
              onChange={(e) => setEnabled((s) => ({ ...s, [t]: e.target.checked }))}
            />
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: TYPE_COLOUR[t] }}
            />
            <span className="capitalize">{t.replace("_", " ")}</span>
          </label>
        ))}
        {q.data && (
          <span className="ml-auto text-xs text-muted">
            {q.data.node_count} nodes · {q.data.link_count} links · {q.data.buckets} user clusters
          </span>
        )}
      </div>
      <div className="card overflow-hidden" style={{ height: "70vh" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
