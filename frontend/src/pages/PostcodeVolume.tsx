import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import ExportMenu from "../components/ExportMenu";
import OrgToggle from "../components/OrgToggle";
import { RankedBar } from "../components/RankedBar";
import { PartySizeBar } from "../components/PartySizeBar";
import AnimatedNumber from "../components/AnimatedNumber";
import { downloadCsv } from "../lib/export";
import type {
  TicketDistrictsResp,
  TicketSummaryResp,
  TicketRecordsResp,
} from "../lib/postcodeAreas";

export default function PostcodeVolume() {
  const f = useFilters();
  const q = f.asQuery();

  // Keep selected district in the URL so it survives navigation/refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("district");
  const setSelected = (code: string | null) =>
    setSearchParams(code ? { district: code } : {}, { replace: true });

  const summary = useQuery({
    queryKey: ["postcode-ticket-summary", q],
    queryFn: () =>
      api<TicketSummaryResp>("/api/analytics/viz/postcode-ticket-summary/", { query: q }),
    staleTime: 5 * 60_000,
  });

  const districts = useQuery({
    queryKey: ["postcode-ticket-districts", q],
    queryFn: () =>
      api<TicketDistrictsResp>("/api/analytics/viz/postcode-ticket-districts/", { query: q }),
    staleTime: 5 * 60_000,
  });

  const breakdown = useQuery({
    queryKey: ["postcode-ticket-districts", q, selected],
    queryFn: () =>
      api<TicketDistrictsResp>("/api/analytics/viz/postcode-ticket-districts/", {
        query: { ...q, district: selected! },
      }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });

  const records = useQuery({
    queryKey: ["postcode-ticket-records", q, selected],
    queryFn: () =>
      api<TicketRecordsResp>("/api/analytics/viz/postcode-ticket-records/", {
        query: { ...q, limit: "200" },
      }),
    staleTime: 5 * 60_000,
  });

  const s = summary.data;
  const districtList = districts.data?.districts ?? [];
  const orgs = breakdown.data?.orgs ?? [];
  const recordRows = (records.data?.results ?? []).filter(
    (r) => !selected || r.postcode.toUpperCase().startsWith(selected),
  );

  const topPostcodesChart = (s?.top_postcodes ?? []).map((p) => ({
    name: p.code,
    value: p.total_tickets,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="heading-main">Ticket Volume</h1>
          <p className="body-lg">
            How many tickets people from each postcode bought per order — average
            party size and group-booking patterns, distinct from raw visitor counts.
          </p>
        </div>
        <OrgToggle />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs uppercase text-muted">Total tickets</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <AnimatedNumber value={s?.total_tickets ?? 0} />
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase text-muted">Total orders</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <AnimatedNumber value={s?.total_orders ?? 0} />
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase text-muted">Avg. party size</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <AnimatedNumber
              value={s?.avg_party_size ?? 0}
              format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            />{" "}
            tickets/order
          </p>
        </div>
      </div>

      {/* District chip picker */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="heading-sub">Select a district</h2>
          {selected && (
            <button onClick={() => setSelected(null)} className="btn-ghost text-xs text-muted">
              Clear
            </button>
          )}
        </div>

        {districts.isLoading ? (
          <p className="text-sm text-muted">Loading districts…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {districtList.map((d) => {
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
                    {d.total_tickets.toLocaleString()}
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
          <h2 className="heading-sub">{selected} — ticket volume by organisation</h2>
          {breakdown.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !orgs.length ? (
            <p className="text-sm text-muted">No data for {selected}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-1.5">Organisation</th>
                  <th className="py-1.5 text-right">Tickets</th>
                  <th className="py-1.5 text-right">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orgs.map((org, i) => (
                  <tr key={org.organisation_id ?? i}>
                    <td className="py-1.5">{org.organisation}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {org.total_tickets.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {org.order_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <h2 className="heading-sub">Top postcodes by ticket volume</h2>
          {summary.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <RankedBar data={topPostcodesChart} label="Tickets" height={280} />
          )}
        </div>
        <div className="card p-4 space-y-2">
          <h2 className="heading-sub">Party-size distribution</h2>
          {summary.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <PartySizeBar data={s?.party_size_distribution ?? []} height={280} />
          )}
        </div>
      </div>

      {/* Raw purchases table */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="heading-sub">Ticket purchases</h2>
          <ExportMenu
            items={[
              {
                label: "Download CSV",
                disabled: !recordRows.length,
                onClick: () =>
                  downloadCsv(
                    "postcode-ticket-purchases.csv",
                    recordRows,
                    [
                      { key: "postcode", label: "Postcode" },
                      { key: "area", label: "Area" },
                      { key: "organisation", label: "Organisation" },
                      { key: "event_title", label: "Event" },
                      { key: "ticket_quantity", label: "Tickets" },
                      { key: "purchase_date", label: "Purchase date" },
                    ],
                  ),
              },
            ]}
          />
        </div>

        {records.isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !recordRows.length ? (
          <p className="text-sm text-muted">No ticket purchases match the current filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1.5">Postcode</th>
                <th className="py-1.5">Event</th>
                <th className="py-1.5">Organisation</th>
                <th className="py-1.5 text-right">Tickets</th>
                <th className="py-1.5 text-right">Purchased</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recordRows.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5">{r.postcode}</td>
                  <td className="py-1.5 truncate max-w-[220px]">{r.event_title || "—"}</td>
                  <td className="py-1.5">{r.organisation}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.ticket_quantity}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.purchase_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
