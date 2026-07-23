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
            {orgs.data?.results.map((o) => (
              <tr key={o.id} className="hover:bg-border/10">
                <td className="px-4 py-2">
                  <Link
                    to={`/insights/organisations/${o.slug}`}
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                  >
                    {o.name}
                    {o.is_partner && <PartnerBadge />}
                  </Link>
                  {o.parent_name && (
                    <div className="text-xs text-muted">sub-org of {o.parent_name}</div>
                  )}
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
