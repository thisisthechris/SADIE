import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
const POSTCODES = [
    "PL1", "PL2", "PL3", "PL4", "PL5", "PL6", "PL7", "PL8", "PL9", "PL10",
    "PL11", "PL12", "PL13", "PL14", "PL15", "PL16", "PL17", "PL18", "PL19", "PL20", "PL21",
];
export default function RecommendationsWidget() {
    const [postcode, setPostcode] = useState("PL1");
    const [km, setKm] = useState(5);
    const q = useQuery({
        queryKey: ["rec-near", postcode, km],
        queryFn: () => api("/api/analytics/recommendations/near/", {
            query: { postcode, km, limit: 10 },
        }),
    });
    return (_jsxs("div", { className: "card p-4 space-y-3", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsx("h3", { className: "font-medium text-sm", children: "Events near you" }) }), _jsxs("div", { className: "flex items-end gap-2 text-sm", children: [_jsxs("label", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-[10px] uppercase tracking-wide text-muted", children: "Postcode" }), _jsx("select", { className: "input", value: postcode, onChange: (e) => setPostcode(e.target.value), children: POSTCODES.map((p) => (_jsx("option", { value: p, children: p }, p))) })] }), _jsxs("label", { className: "flex flex-col gap-1 flex-1", children: [_jsxs("span", { className: "text-[10px] uppercase tracking-wide text-muted", children: ["Within ", km, " km"] }), _jsx("input", { type: "range", min: 1, max: 25, step: 1, value: km, onChange: (e) => setKm(Number(e.target.value)) })] })] }), q.isLoading && _jsx("p", { className: "text-xs text-muted", children: "Loading\u2026" }), q.data && (_jsxs("ul", { className: "divide-y divide-border text-xs", children: [q.data.results.length === 0 && (_jsx("li", { className: "py-2 text-muted", children: "No upcoming events nearby." })), q.data.results.map((e) => (_jsxs("li", { className: "py-2", children: [_jsx("div", { className: "font-medium truncate", children: e.title }), _jsxs("div", { className: "text-muted truncate", children: [e.organisation.name, e.start_datetime && ` · ${new Date(e.start_datetime).toLocaleDateString()}`, e.distance_km != null && ` · ${e.distance_km.toFixed(1)} km`] })] }, e.id)))] }))] }));
}
