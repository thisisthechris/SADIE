import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import PartnerBadge from "../components/PartnerBadge";
import OrgToggle from "../components/OrgToggle";
import type { OrganisationSummary, Paginated } from "../lib/types";

export default function OrganisationsPage() {
  const f = useFilters();
  const q = { ...f.asQuery(), page_size: "100", ordering: "-is_partner,name" };
  const orgs = useQuery({
    queryKey: ["orgs-list", q],
    queryFn: () =>
      api<Paginated<OrganisationSummary>>("/api/organisations/", { query: q }),
  });

  // Group into parent-then-children order so the hierarchy reads as a tree
  // rather than a flat list with a "sub-org of X" caption easy to miss.
  const rows = orgs.data?.results ?? [];
  const byParent = new Map<number, OrganisationSummary[]>();
  const topLevel: OrganisationSummary[] = [];
  for (const o of rows) {
    if (o.parent_id) {
      const arr = byParent.get(o.parent_id) ?? [];
      arr.push(o);
      byParent.set(o.parent_id, arr);
    } else {
      topLevel.push(o);
    }
  }
  const ordered: Array<{ org: OrganisationSummary; indent: boolean }> = [];
  for (const parent of topLevel) {
    ordered.push({ org: parent, indent: false });
    for (const child of byParent.get(parent.id) ?? []) {
      ordered.push({ org: child, indent: true });
    }
  }
  // Orphaned children (parent not present in the current filtered page) still show, unindented.
  const seen = new Set(ordered.map((r) => r.org.id));
  for (const arr of byParent.values()) {
    for (const child of arr) {
      if (!seen.has(child.id)) {
        ordered.push({ org: child, indent: false });
        seen.add(child.id);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Organisations</h1>
          <p className="body-lg">
            Plymouth&rsquo;s arts &amp; cultural organisations being tracked. Click
            a row to drill in.
          </p>
        </div>
        <OrgToggle />
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-border/20">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium tabular-nums">Locations</th>
              <th className="px-4 py-2 font-medium tabular-nums">Events</th>
              <th className="px-4 py-2 font-medium tabular-nums">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordered.map(({ org: o, indent }) => (
              <tr key={o.id} className="hover:bg-border/10">
                <td className="px-4 py-2">
                  <Link
                    to={`/insights/organisations/${o.slug}`}
                    className={`inline-flex items-center gap-2 font-medium hover:underline ${indent ? "pl-5" : ""}`}
                  >
                    {indent && <span className="text-muted">↳</span>}
                    {o.name}
                    {o.is_partner && <PartnerBadge />}
                  </Link>
                </td>
                <td className="px-4 py-2 tabular-nums text-muted">
                  {o.location_count ?? 0}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted">
                  {o.event_count ?? 0}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted">
                  {o.member_count ?? 0}
                </td>
              </tr>
            ))}
            {orgs.data && orgs.data.results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-muted">
                  No organisations match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
