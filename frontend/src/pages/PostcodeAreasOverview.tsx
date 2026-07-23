import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import ExportMenu from "../components/ExportMenu";
import OrgToggle from "../components/OrgToggle";
import { downloadCsv } from "../lib/export";
import {
  type District,
  type DistrictsResp,
  type OrgRow,
} from "../lib/postcodeAreas";

export default function PostcodeAreasOverview() {
  const f = useFilters();
  const q = f.asQuery();

  // Keep selected district in the URL so navigating to the map page preserves it.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("district");
  const setSelected = (code: string | null) =>
    setSearchParams(code ? { district: code } : {}, { replace: true });

  const summary = useQuery({
    queryKey: ["postcode-districts", q],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", { query: q }),
    staleTime: 5 * 60_000,
  });

  const breakdown = useQuery({
    queryKey: ["postcode-districts", q, selected],
    queryFn: () =>
      api<DistrictsResp>("/api/analytics/viz/postcode-districts/", {
        query: { ...q, district: selected! },
      }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });

  const districts: District[] = summary.data?.districts ?? [];
  const orgs: OrgRow[] = breakdown.data?.orgs ?? [];
  const selectedTotal = selected
    ? districts.find((d) => d.code === selected)?.total ?? 0
    : 0;

  return (
    <div className="space-y-6">
      {/* Header + tab nav */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Postcode Areas</h1>
          <p className="body-lg">
            Explore which cultural venues and organisations attract visitors from
            each postcode district. Select a district to see the breakdown.
          </p>
        </div>
        <OrgToggle />
      </div>

      {/* District chip picker */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="heading-sub">Select a district</h2>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="btn-ghost text-xs text-muted"
            >
              Clear
            </button>
          )}
        </div>

        {summary.isLoading ? (
          <p className="text-sm text-muted">Loading districts…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {districts.map((d) => {
              const active = d.code === selected;
              return (
                <button
                  key={d.code}
                  onClick={() => setSelected(active ? null : d.code)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? "bg-accent text-white border-accent"
                      : "border-border hover:bg-border/30"
                  }`}
                >
                  <span>{d.code}</span>
                  <span className={`text-[10px] ${active ? "text-white/75" : "text-muted"}`}>
                    {d.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Org breakdown for selected district */}
      {selected && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="heading-sub">{selected} — cultural engagement</h2>
              <p className="text-xs text-muted mt-0.5">
                {selectedTotal.toLocaleString()} total interactions from this district
              </p>
            </div>
            <ExportMenu
              items={[
                {
                  label: "Download CSV",
                  disabled: !orgs.length,
                  onClick: () =>
                    downloadCsv(
                      `postcode-${selected}.csv`,
                      orgs,
                      [
                        { key: "organisation", label: "Organisation" },
                        { key: "count", label: "Interactions" },
                      ],
                    ),
                },
              ]}
            />
          </div>

          {breakdown.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !orgs.length ? (
            <p className="text-sm text-muted">No data for {selected}.</p>
          ) : (
            <div className="space-y-2">
              {orgs.map((org, i) => {
                const pct = selectedTotal
                  ? Math.round((org.count / selectedTotal) * 100)
                  : 0;
                return (
                  <div key={org.organisation_id ?? i} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{org.organisation}</span>
                      <span className="tabular-nums text-muted ml-4 shrink-0">
                        {org.count.toLocaleString()}
                        <span className="text-xs ml-1">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* All-districts table (when nothing selected) */}
      {!selected && !summary.isLoading && districts.length > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="heading-sub">All districts</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1.5">District</th>
                <th className="py-1.5 text-right">Interactions</th>
                <th className="py-1.5 w-1/3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {districts.map((d) => {
                const max = districts[0]?.total ?? 1;
                const pct = Math.round((d.total / max) * 100);
                return (
                  <tr
                    key={d.code}
                    className="cursor-pointer hover:bg-border/20 transition-colors"
                    onClick={() => setSelected(d.code)}
                  >
                    <td className="py-2 font-medium">{d.code}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {d.total.toLocaleString()}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
