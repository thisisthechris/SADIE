import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";
import PartnerBadge from "../components/PartnerBadge";
export default function OrganisationsPage() {
    const f = useFilters();
    const q = { ...f.asQuery(), page_size: "100", ordering: "-is_partner,name" };
    const orgs = useQuery({
        queryKey: ["orgs-list", q],
        queryFn: () => api("/api/organisations/", { query: q }),
    });
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Organisations" }), _jsx("p", { className: "text-sm text-muted", children: "Plymouth\u2019s arts & cultural organisations being tracked. Click a row to drill in." })] }), _jsx(FilterBar, {}), _jsx("div", { className: "card overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-border/20", children: _jsxs("tr", { className: "text-left", children: [_jsx("th", { className: "px-4 py-2 font-medium", children: "Name" }), _jsx("th", { className: "px-4 py-2 font-medium tabular-nums", children: "Locations" }), _jsx("th", { className: "px-4 py-2 font-medium tabular-nums", children: "Events" }), _jsx("th", { className: "px-4 py-2 font-medium tabular-nums", children: "Members" })] }) }), _jsxs("tbody", { className: "divide-y divide-border", children: [orgs.data?.results.map((o) => (_jsxs("tr", { className: "hover:bg-border/10", children: [_jsxs("td", { className: "px-4 py-2", children: [_jsxs(Link, { to: `/organisations/${o.slug}`, className: "inline-flex items-center gap-2 font-medium hover:underline", children: [o.name, o.is_partner && _jsx(PartnerBadge, {})] }), o.parent_name && (_jsxs("div", { className: "text-xs text-muted", children: ["sub-org of ", o.parent_name] }))] }), _jsx("td", { className: "px-4 py-2 tabular-nums text-muted", children: o.location_count ?? 0 }), _jsx("td", { className: "px-4 py-2 tabular-nums text-muted", children: o.event_count ?? 0 }), _jsx("td", { className: "px-4 py-2 tabular-nums text-muted", children: o.member_count ?? 0 })] }, o.id))), orgs.data && orgs.data.results.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-4 py-3 text-muted", children: "No organisations match the current filters." }) }))] })] }) })] }));
}
