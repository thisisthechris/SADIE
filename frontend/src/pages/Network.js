import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
// 3d-force-graph ships a UMD-style default export; types are loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ForceGraph3D from "3d-force-graph";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";
const TYPE_COLOUR = {
    organisation: "#7dd3fc",
    category: "#fbbf24",
    user_cluster: "#a78bfa",
};
const TYPES = ["organisation", "category", "user_cluster"];
export default function Network() {
    const f = useFilters();
    const containerRef = useRef(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graphRef = useRef(null);
    const [enabled, setEnabled] = useState({
        organisation: true,
        category: true,
        user_cluster: true,
    });
    const reduceMotion = useMemo(() => typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
    const q = useQuery({
        queryKey: ["viz-network", f.asQuery()],
        queryFn: () => api("/api/analytics/viz/network/", { query: { ...f.asQuery(), buckets: "16" } }),
    });
    // Bootstrap the 3d-force-graph instance once.
    useEffect(() => {
        if (!containerRef.current || graphRef.current)
            return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = ForceGraph3D()(containerRef.current)
            .backgroundColor("#0b0d10")
            .nodeLabel((n) => `${n.type}: ${n.label}`)
            .nodeColor((n) => TYPE_COLOUR[n.type])
            .nodeVal((n) => (n.type === "user_cluster" ? Math.max(2, Math.log2((n.weight ?? 1) + 1)) : 4))
            .linkOpacity(0.4)
            .linkColor(() => "#475569")
            .linkWidth((l) => Math.min(4, Math.log2(l.value + 1)))
            .enableNodeDrag(false);
        if (reduceMotion)
            g.cooldownTicks(0);
        graphRef.current = g;
        const onResize = () => {
            const el = containerRef.current;
            if (!el || !graphRef.current)
                return;
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
        if (!g || !q.data)
            return;
        const nodes = q.data.nodes.filter((n) => enabled[n.type]);
        const allowed = new Set(nodes.map((n) => n.id));
        const links = q.data.links.filter((l) => allowed.has(l.source) && allowed.has(l.target));
        g.graphData({ nodes, links });
    }, [q.data, enabled]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Network" }), _jsx("p", { className: "text-sm text-muted", children: "Tripartite graph linking organisations to categories and to anonymised user clusters (MD5-bucketed user hashes). Toggle node types below." })] }), _jsx(FilterBar, {}), _jsxs("div", { className: "card p-3 flex flex-wrap items-center gap-3 text-sm", children: [TYPES.map((t) => (_jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: enabled[t], onChange: (e) => setEnabled((s) => ({ ...s, [t]: e.target.checked })) }), _jsx("span", { className: "inline-block w-3 h-3 rounded-full", style: { background: TYPE_COLOUR[t] } }), _jsx("span", { className: "capitalize", children: t.replace("_", " ") })] }, t))), q.data && (_jsxs("span", { className: "ml-auto text-xs text-muted", children: [q.data.node_count, " nodes \u00B7 ", q.data.link_count, " links \u00B7 ", q.data.buckets, " user clusters"] }))] }), _jsx("div", { className: "card overflow-hidden", style: { height: "70vh" }, children: _jsx("div", { ref: containerRef, style: { width: "100%", height: "100%" } }) })] }));
}
