import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useMe } from "../lib/auth";
import PartnerBadge from "../components/PartnerBadge";
export default function OrganisationDetailPage() {
    const { slug = "" } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { data: me } = useMe();
    const setFilters = useFilters((s) => s.set);
    const detail = useQuery({
        queryKey: ["org-detail", slug],
        queryFn: () => api(`/api/organisations/${slug}/`),
    });
    const orgIdQuery = useMemo(() => (detail.data ? { org: String(detail.data.id) } : undefined), [detail.data]);
    const postcodes = useQuery({
        enabled: !!orgIdQuery,
        queryKey: ["org-detail-postcodes", slug],
        queryFn: () => api("/api/analytics/viz/postcode-bars/", {
            query: orgIdQuery,
        }),
    });
    const venues = useQuery({
        enabled: !!orgIdQuery,
        queryKey: ["org-detail-venues", slug],
        queryFn: () => api("/api/analytics/viz/event-points/", {
            query: orgIdQuery,
        }),
    });
    if (detail.isLoading) {
        return _jsx("div", { className: "card p-6 text-sm text-muted", children: "Loading\u2026" });
    }
    if (detail.isError || !detail.data) {
        return (_jsxs("div", { className: "card p-6", children: [_jsx("p", { className: "text-sm text-red-600", children: "Couldn\u2019t load this organisation." }), _jsx(Link, { className: "text-sm text-accent hover:underline", to: "/organisations", children: "\u2190 Back to organisations" })] }));
    }
    const org = detail.data;
    const seedAndGo = (path) => {
        setFilters({ org: String(org.id) });
        navigate(path);
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { children: _jsx(Link, { to: "/organisations", className: "text-sm text-accent hover:underline", children: "\u2190 All organisations" }) }), _jsx(Header, { org: org }), _jsx(StatsStrip, { eventCount: org.event_count, memberCount: org.member_count, locationCount: org.locations.length, childCount: org.children.length, rollup: org.children.length > 0 }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { className: "rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10", onClick: () => seedAndGo("/map"), children: "Open in Map" }), _jsx("button", { className: "rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10", onClick: () => seedAndGo("/postcodes"), children: "Postcodes" }), _jsx("button", { className: "rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10", onClick: () => seedAndGo("/calendar"), children: "Calendar" }), _jsx("button", { className: "rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10", onClick: () => seedAndGo("/network"), children: "Network" })] }), org.children.length > 0 && _jsx(ChildrenGrid, { children: org.children }), org.locations.length > 0 && _jsx(LocationsTable, { locations: org.locations }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(TopVenuesCard, { loading: venues.isLoading, rows: venues.data?.results ?? [] }), _jsx(TopPostcodesCard, { loading: postcodes.isLoading, rows: postcodes.data?.results ?? [] })] }), org.can_edit && (_jsx(EditPanel, { org: org, isStaff: !!me?.is_staff, onSaved: () => qc.invalidateQueries({ queryKey: ["org-detail", slug] }) }))] }));
}
function Header({ org }) {
    return (_jsxs("div", { className: "card p-6", children: [_jsx("div", { className: "flex flex-wrap items-start justify-between gap-3", children: _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h1", { className: "text-2xl font-semibold", children: org.name }), org.is_partner && _jsx(PartnerBadge, {})] }), org.parent && (_jsxs("p", { className: "text-sm text-muted", children: ["Sub-organisation of", " ", _jsx(Link, { to: `/organisations/${org.parent.slug}`, className: "hover:underline", children: org.parent.name })] })), org.website && (_jsx("a", { href: org.website, target: "_blank", rel: "noreferrer", className: "mt-1 inline-block text-sm text-accent hover:underline", children: org.website }))] }) }), org.description && (_jsx("p", { className: "mt-4 whitespace-pre-line text-sm text-muted", children: org.description }))] }));
}
function StatsStrip({ eventCount, memberCount, locationCount, childCount, rollup, }) {
    return (_jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Stat, { label: rollup ? "Events (rolled up)" : "Events", value: eventCount }), _jsx(Stat, { label: "Locations", value: locationCount }), _jsx(Stat, { label: "Sub-orgs", value: childCount }), _jsx(Stat, { label: "Members", value: memberCount })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs uppercase tracking-wide text-muted", children: label }), _jsx("div", { className: "mt-1 text-2xl font-semibold tabular-nums", children: value })] }));
}
function ChildrenGrid({ children, }) {
    return (_jsxs("div", { className: "card p-4", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold", children: "Sub-organisations" }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: children.map((c) => (_jsx(Link, { to: `/organisations/${c.slug}`, className: "rounded border border-border px-3 py-2 text-sm hover:bg-border/10", children: _jsxs("span", { className: "inline-flex items-center gap-2 font-medium", children: [c.name, c.is_partner && _jsx(PartnerBadge, {})] }) }, c.id))) })] }));
}
function LocationsTable({ locations, }) {
    return (_jsxs("div", { className: "card overflow-hidden", children: [_jsx("h2", { className: "px-4 pt-4 text-lg font-semibold", children: "Locations" }), _jsxs("table", { className: "mt-2 w-full text-sm", children: [_jsx("thead", { className: "bg-border/20 text-left", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2 font-medium", children: "Name" }), _jsx("th", { className: "px-4 py-2 font-medium", children: "Address" }), _jsx("th", { className: "px-4 py-2 font-medium", children: "Postcode" })] }) }), _jsx("tbody", { className: "divide-y divide-border", children: locations.map((l) => (_jsxs("tr", { children: [_jsx("td", { className: "px-4 py-2 font-medium", children: l.name }), _jsx("td", { className: "px-4 py-2 text-muted", children: l.address ?? "" }), _jsx("td", { className: "px-4 py-2 tabular-nums text-muted", children: l.postcode ?? "" })] }, l.id))) })] })] }));
}
function TopVenuesCard({ loading, rows, }) {
    const top = [...rows].sort((a, b) => b.event_count - a.event_count).slice(0, 8);
    return (_jsxs("div", { className: "card p-4", children: [_jsx("h2", { className: "mb-2 text-lg font-semibold", children: "Top venues" }), loading ? (_jsx("p", { className: "text-sm text-muted", children: "Loading\u2026" })) : top.length === 0 ? (_jsx("p", { className: "text-sm text-muted", children: "No venue activity yet." })) : (_jsx("ul", { className: "space-y-1 text-sm", children: top.map((r) => (_jsxs("li", { className: "flex items-center justify-between gap-3", children: [_jsx("span", { className: "truncate", children: r.name }), _jsx("span", { className: "tabular-nums text-muted", children: r.event_count })] }, r.location_id))) }))] }));
}
function TopPostcodesCard({ loading, rows, }) {
    const top = [...rows].sort((a, b) => b.total - a.total).slice(0, 8);
    const max = top[0]?.total ?? 0;
    return (_jsxs("div", { className: "card p-4", children: [_jsx("h2", { className: "mb-2 text-lg font-semibold", children: "Top postcodes" }), loading ? (_jsx("p", { className: "text-sm text-muted", children: "Loading\u2026" })) : top.length === 0 ? (_jsx("p", { className: "text-sm text-muted", children: "No postcode interactions yet." })) : (_jsx("ul", { className: "space-y-1 text-sm", children: top.map((r) => (_jsxs("li", { className: "grid grid-cols-[5rem_1fr_3rem] items-center gap-2", children: [_jsx("span", { className: "font-mono text-xs", children: r.postcode }), _jsx("span", { className: "block h-2 rounded bg-accent/40", style: { width: max ? `${(r.total / max) * 100}%` : "0%" } }), _jsx("span", { className: "text-right tabular-nums text-muted", children: r.total })] }, r.postcode))) }))] }));
}
function EditPanel({ org, isStaff, onSaved, }) {
    const [name, setName] = useState(org.name);
    const [website, setWebsite] = useState(org.website);
    const [description, setDescription] = useState(org.description);
    const [isPartner, setIsPartner] = useState(org.is_partner);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        setName(org.name);
        setWebsite(org.website);
        setDescription(org.description);
        setIsPartner(org.is_partner);
    }, [org.id, org.name, org.website, org.description, org.is_partner]);
    const save = useMutation({
        mutationFn: (body) => api(`/api/organisations/${org.slug}/`, {
            method: "PATCH",
            body,
        }),
        onSuccess: () => {
            setError(null);
            setSaved(true);
            onSaved();
            window.setTimeout(() => setSaved(false), 1500);
        },
        onError: (e) => {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            setSaved(false);
        },
    });
    return (_jsxs("form", { className: "card p-4", onSubmit: (e) => {
            e.preventDefault();
            const body = { name, website, description };
            if (isStaff)
                body.is_partner = isPartner;
            save.mutate(body);
        }, children: [_jsx("h2", { className: "mb-3 text-lg font-semibold", children: "Edit organisation" }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-muted", children: "Name" }), _jsx("input", { value: name, onChange: (e) => setName(e.target.value), className: "w-full rounded border border-border bg-transparent px-2 py-1" })] }), _jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-muted", children: "Website" }), _jsx("input", { value: website, onChange: (e) => setWebsite(e.target.value), className: "w-full rounded border border-border bg-transparent px-2 py-1" })] }), _jsxs("label", { className: "text-sm md:col-span-2", children: [_jsx("span", { className: "mb-1 block text-muted", children: "Description" }), _jsx("textarea", { value: description, onChange: (e) => setDescription(e.target.value), rows: 4, className: "w-full rounded border border-border bg-transparent px-2 py-1" })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm md:col-span-2", children: [_jsx("input", { type: "checkbox", checked: isPartner, disabled: !isStaff, onChange: (e) => setIsPartner(e.target.checked) }), _jsxs("span", { children: ["Partner organisation", !isStaff && (_jsx("span", { className: "ml-1 text-xs text-muted", children: "(staff only)" }))] })] })] }), error && _jsx("p", { className: "mt-3 text-sm text-red-600", children: error }), _jsxs("div", { className: "mt-4 flex items-center gap-3", children: [_jsx("button", { type: "submit", disabled: save.isPending, className: "rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50", children: save.isPending ? "Saving…" : "Save changes" }), saved && _jsx("span", { className: "text-sm text-green-600", children: "Saved." }), _jsx("span", { className: "text-xs text-muted", children: "Parent / sub-org links and members are managed in the Django admin." })] })] }));
}
