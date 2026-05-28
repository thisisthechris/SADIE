import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";
/**
 * Lightweight calendar — groups upcoming events by day, with one-click
 * subscribe/download/copy for the filtered ICS feed (served from the legacy
 * /calendar.ics endpoint, which already honours the same filter schema).
 */
export default function CalendarPage() {
    const f = useFilters();
    const q = {
        ...f.asQuery(),
        ordering: "start_datetime",
        page_size: "500",
    };
    const events = useQuery({
        queryKey: ["calendar-events", q],
        queryFn: async () => {
            // Follow DRF pagination so we don't silently truncate at one page.
            const all = [];
            let page = await api("/api/events/", { query: q });
            all.push(...page.results);
            while (page.next) {
                // `next` is an absolute URL with the page param baked in.
                const nextUrl = new URL(page.next);
                page = await api(nextUrl.pathname + nextUrl.search);
                all.push(...page.results);
            }
            return all;
        },
    });
    const grouped = groupByDay(events.data ?? []);
    const subscribeUrls = buildSubscribeUrls(f.asQuery());
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(subscribeUrls.https);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
        catch {
            /* clipboard unavailable */
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Calendar" }), _jsx("p", { className: "text-sm text-muted", children: "Upcoming events grouped by day. Subscribe below to sync this filter into your calendar app." })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("a", { href: subscribeUrls.webcal, className: "btn-ghost text-xs border border-border", title: "Open in your default calendar app", children: "Subscribe (webcal)" }), _jsx("a", { href: subscribeUrls.https, download: "sadie-events.ics", className: "btn-ghost text-xs border border-border", children: "Download .ics" }), _jsx("button", { type: "button", onClick: onCopy, className: "btn-ghost text-xs border border-border", children: copied ? "Copied!" : "Copy link" })] })] }), _jsx(FilterBar, {}), _jsxs("div", { className: "space-y-4", children: [grouped.map(([day, items]) => (_jsxs("div", { className: "card overflow-hidden", children: [_jsx("div", { className: "px-4 py-2 border-b border-border bg-border/20 text-sm font-medium", children: day }), _jsx("ul", { className: "divide-y divide-border", children: items.map((e) => (_jsxs("li", { className: "px-4 py-2 flex items-center gap-3", children: [_jsx("span", { className: "text-xs text-muted w-16 tabular-nums", children: new Date(e.start_datetime).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }) }), _jsx("span", { className: "flex-1 truncate", children: e.title }), _jsx("span", { className: "text-xs text-muted truncate", children: e.organisation_name })] }, e.id))) })] }, day))), events.data && events.data.length === 0 && (_jsx("div", { className: "card p-4 text-sm text-muted", children: "No events found." }))] })] }));
}
function groupByDay(items) {
    const map = new Map();
    for (const e of items) {
        const key = new Date(e.start_datetime).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        const arr = map.get(key) ?? [];
        arr.push(e);
        map.set(key, arr);
    }
    return Array.from(map.entries());
}
function buildSubscribeUrls(query) {
    const qs = new URLSearchParams(query).toString();
    const path = qs ? `/calendar.ics?${qs}` : "/calendar.ics";
    const https = `${window.location.origin}${path}`;
    const webcal = https.replace(/^https?:\/\//, "webcal://");
    return { https, webcal };
}
