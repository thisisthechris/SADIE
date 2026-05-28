import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters";
import { useSavedView } from "../lib/savedViews";
/**
 * `/app/v/:slug` — fetches a SavedView, hydrates the filter store from its
 * stored querystring, then redirects to its target SPA path.
 */
export default function ViewResolver() {
    const { slug } = useParams();
    const { data, isLoading, error } = useSavedView(slug);
    const f = useFilters();
    const nav = useNavigate();
    useEffect(() => {
        if (!data)
            return;
        const params = new URLSearchParams(data.query_string || "");
        const patch = {};
        params.forEach((v, k) => {
            patch[k] = v;
        });
        f.reset();
        f.set(patch);
        // Strip /app prefix if present, since router is mounted at /
        const path = data.path.replace(/^\/app/, "") || "/";
        nav(path, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.id]);
    if (isLoading) {
        return _jsx("div", { className: "card p-6 text-sm text-muted", children: "Loading saved view\u2026" });
    }
    if (error) {
        return (_jsx("div", { className: "card p-6 text-sm text-red-400", children: "Could not load this view (it may be private or deleted)." }));
    }
    return null;
}
