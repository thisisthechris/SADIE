import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useFilters } from "../lib/filters";
import { useMe } from "../lib/auth";
import PartnerBadge from "../components/PartnerBadge";
import AnimatedNumber from "../components/AnimatedNumber";
import type { OrganisationDetail, OrgGoal, Paginated } from "../lib/types";

interface PostcodeBarsResp {
  results: Array<{ postcode: string; area: string; total: number }>;
}
interface EventPointsResp {
  results: Array<{
    location_id: number;
    name: string;
    organisation: string;
    event_count: number;
  }>;
}

export default function OrganisationDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const f = useFilters();

  const detail = useQuery({
    queryKey: ["org-detail", slug],
    queryFn: () => api<OrganisationDetail>(`/api/organisations/${slug}/`),
  });

  const orgIdQuery = useMemo(() => {
    if (!detail.data) return undefined;
    // Use global filters (date, period, category, itype) but lock org to this page
    const { org: _ignored, ...globalFilters } = f.asQuery();
    return { ...globalFilters, org: String(detail.data.id) };
  }, [detail.data, f]);

  const postcodes = useQuery({
    enabled: !!orgIdQuery,
    queryKey: ["org-detail-postcodes", slug, orgIdQuery],
    queryFn: () =>
      api<PostcodeBarsResp>("/api/analytics/viz/postcode-bars/", {
        query: orgIdQuery,
      }),
  });

  const venues = useQuery({
    enabled: !!orgIdQuery,
    queryKey: ["org-detail-venues", slug, orgIdQuery],
    queryFn: () =>
      api<EventPointsResp>("/api/analytics/viz/event-points/", {
        query: orgIdQuery,
      }),
  });

  if (detail.isLoading) {
    return <div className="card p-6 text-sm text-muted">Loading…</div>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="card p-6">
        <p className="text-sm text-red-600">
          Couldn&rsquo;t load this organisation.
        </p>
        <Link className="text-sm text-accent hover:underline" to="/insights/organisations">
          ← Back to organisations
        </Link>
      </div>
    );
  }

  const org = detail.data;

  const seedAndGo = (path: string) => {
    f.set({ org: String(org.id) });
    navigate(path);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/insights/organisations" className="text-sm text-accent hover:underline">
          ← All organisations
        </Link>
      </div>

      <Header org={org} />

      <StatsStrip
        eventCount={org.event_count}
        memberCount={org.member_count}
        locationCount={org.locations.length}
        childCount={org.children.length}
        rollup={org.children.length > 0}
      />

      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10" onClick={() => seedAndGo("/map")}>
          Open in Map
        </button>
        <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10" onClick={() => seedAndGo("/postcodes")}>
          Postcodes
        </button>
        <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10" onClick={() => seedAndGo("/calendar")}>
          Calendar
        </button>
        <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10" onClick={() => seedAndGo("/network")}>
          Network
        </button>
      </div>

      {org.children.length > 0 && <ChildrenGrid children={org.children} />}

      {org.locations.length > 0 && (org.can_edit ? <VenueManagePanel org={org} onMerged={() => qc.invalidateQueries({ queryKey: ["org-detail", slug] })} /> : <LocationsTable locations={org.locations} />)}

      <div className="grid gap-4 md:grid-cols-2">
        <TopVenuesCard
          loading={venues.isLoading}
          rows={venues.data?.results ?? []}
        />
        <TopPostcodesCard
          loading={postcodes.isLoading}
          rows={postcodes.data?.results ?? []}
        />
      </div>

      {org.can_edit && (
        <MembersCard
          org={org}
          isStaff={!!me?.is_staff}
          onChanged={() => qc.invalidateQueries({ queryKey: ["org-detail", slug] })}
        />
      )}

      <GoalsCard org={org} />

      <ReportsCard org={org} />

      {org.can_edit && (
        <EditPanel
          org={org}
          isStaff={!!me?.is_staff}
          onSaved={() => qc.invalidateQueries({ queryKey: ["org-detail", slug] })}
        />
      )}
    </div>
  );
}

function Header({ org }: { org: OrganisationDetail }) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="heading-main leading-snug">{org.name}</h1>
            {org.is_partner && <PartnerBadge />}
          </div>
          {org.parent && (
            <p className="text-sm text-muted">
              Sub-organisation of{" "}
              <Link
                to={`/organisations/${org.parent.slug}`}
                className="hover:underline"
              >
                {org.parent.name}
              </Link>
            </p>
          )}
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-accent hover:underline"
            >
              {org.website}
            </a>
          )}
        </div>
      </div>
      {org.description && (
        <p className="mt-4 whitespace-pre-line text-sm text-muted">
          {org.description}
        </p>
      )}
    </div>
  );
}

function StatsStrip({
  eventCount,
  memberCount,
  locationCount,
  childCount,
  rollup,
}: {
  eventCount: number;
  memberCount: number;
  locationCount: number;
  childCount: number;
  rollup: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label={rollup ? "Events (rolled up)" : "Events"} value={eventCount} />
      <Stat label="Locations" value={locationCount} />
      <Stat label="Sub-orgs" value={childCount} />
      <Stat label="Members" value={memberCount} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card card-hover p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        <AnimatedNumber value={value} />
      </div>
    </div>
  );
}

function ChildrenGrid({
  children,
}: {
  children: OrganisationDetail["children"];
}) {
  return (
    <div className="card p-4">
      <h2 className="heading-sub mb-3">Sub-organisations</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((c) => (
          <Link
            key={c.id}
            to={`/organisations/${c.slug}`}
            className="rounded border border-border px-3 py-2 text-sm hover:bg-border/10"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              {c.name}
              {c.is_partner && <PartnerBadge />}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LocationsTable({
  locations,
}: {
  locations: OrganisationDetail["locations"];
}) {
  return (
    <div className="card overflow-hidden">
      <h2 className="heading-sub px-4 pt-4">Locations</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="bg-border/20 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Address</th>
            <th className="px-4 py-2 font-medium">Postcode</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {locations.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-2 font-medium">{l.name}</td>
              <td className="px-4 py-2 text-muted">{l.address ?? ""}</td>
              <td className="px-4 py-2 tabular-nums text-muted">
                {l.postcode ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VenueManagePanel({
  org,
  onMerged,
}: {
  org: OrganisationDetail;
  onMerged: () => void;
}) {
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number | null>(null);
  const [parentMap, setParentMap] = useState<Record<number, number | null>>({});

  // Initialize parent map from locations
  useEffect(() => {
    const map: Record<number, number | null> = {};
    org.locations.forEach((loc) => {
      map[loc.id] = loc.parent_id ?? null;
    });
    setParentMap(map);
  }, [org.locations]);

  const setParentMutation = useMutation({
    mutationFn: async (params: { locationId: number; parentId: number | null }) => {
      const body = params.parentId === null ? { parent: null } : { parent: params.parentId };
      return api<unknown>(`/api/organisations/locations/${params.locationId}/`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      onMerged();
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async (params: { sourceId: number; targetId: number }) => {
      return api<unknown>(`/api/organisations/locations/${params.sourceId}/merge_into/`, {
        method: "POST",
        body: { target: params.targetId },
      });
    },
    onSuccess: () => {
      setShowMergeModal(false);
      setSelectedForMerge(null);
      onMerged();
    },
  });

  const handleParentChange = (locationId: number, newParentId: number | null) => {
    setParentMap((prev) => ({ ...prev, [locationId]: newParentId }));
    setParentMutation.mutate({ locationId, parentId: newParentId });
  };

  const handleMergeClick = (locationId: number) => {
    setSelectedForMerge(locationId);
    setShowMergeModal(true);
  };

  const handleConfirmMerge = (targetId: number) => {
    if (selectedForMerge) {
      mergeMutation.mutate({ sourceId: selectedForMerge, targetId });
    }
  };

  return (
    <>
      <div className="card overflow-hidden">
        <h2 className="heading-sub px-4 pt-4">Venues</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="bg-border/20 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Address</th>
              <th className="px-4 py-2 font-medium">Sub-venue of</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {org.locations.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 font-medium">{l.name}</td>
                <td className="px-4 py-2 text-muted">{l.address ?? ""}</td>
                <td className="px-4 py-2 text-muted">
                  <select
                    value={parentMap[l.id] ?? "none"}
                    onChange={(e) =>
                      handleParentChange(
                        l.id,
                        e.target.value === "none" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                    disabled={setParentMutation.isPending}
                  >
                    <option value="none">None</option>
                    {org.locations
                      .filter((candidate) => candidate.id !== l.id && !candidate.parent_id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleMergeClick(l.id)}
                    disabled={mergeMutation.isPending}
                    className="text-sm text-accent hover:underline disabled:opacity-50"
                  >
                    Merge...
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showMergeModal && selectedForMerge && (
        <VenueMergeModal
          sourceLocation={org.locations.find((l) => l.id === selectedForMerge)}
          otherLocations={org.locations.filter((l) => l.id !== selectedForMerge)}
          onMerge={handleConfirmMerge}
          onCancel={() => {
            setShowMergeModal(false);
            setSelectedForMerge(null);
          }}
          isLoading={mergeMutation.isPending}
        />
      )}
    </>
  );
}

function VenueMergeModal({
  sourceLocation,
  otherLocations,
  onMerge,
  onCancel,
  isLoading,
}: {
  sourceLocation: OrganisationDetail["locations"][0] | undefined;
  otherLocations: OrganisationDetail["locations"];
  onMerge: (targetId: number) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(
    otherLocations[0]?.id ?? null
  );

  if (!sourceLocation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card max-w-md space-y-4 p-4">
        <h3 className="font-medium">Merge venue</h3>
        <p className="text-sm text-muted">
          All events from <strong>{sourceLocation.name}</strong> will be moved to the selected venue, and this venue will be deleted.
        </p>
        <div>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Merge into</span>
            <select
              value={selectedTarget ?? ""}
              onChange={(e) => setSelectedTarget(parseInt(e.target.value, 10))}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            >
              {otherLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.address})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedTarget && onMerge(selectedTarget)}
            disabled={isLoading || !selectedTarget}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? "Merging..." : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopVenuesCard({
  loading,
  rows,
}: {
  loading: boolean;
  rows: EventPointsResp["results"];
}) {
  const top = [...rows].sort((a, b) => b.event_count - a.event_count).slice(0, 8);
  return (
    <div className="card p-4">
      <h2 className="heading-sub mb-2">Top venues</h2>
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted">No venue activity yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {top.map((r) => (
            <li
              key={r.location_id}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate">{r.name}</span>
              <span className="tabular-nums text-muted">{r.event_count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopPostcodesCard({
  loading,
  rows,
}: {
  loading: boolean;
  rows: PostcodeBarsResp["results"];
}) {
  const top = [...rows].sort((a, b) => b.total - a.total).slice(0, 8);
  const max = top[0]?.total ?? 0;
  return (
    <div className="card p-4">
      <h2 className="heading-sub mb-2">Top postcodes</h2>
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted">No postcode interactions yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {top.map((r) => (
            <li key={r.postcode} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2">
              <span className="font-mono text-xs">{r.postcode}</span>
              <span
                className="block h-2 rounded bg-accent/40"
                style={{ width: max ? `${(r.total / max) * 100}%` : "0%" }}
              />
              <span className="text-right tabular-nums text-muted">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface UserSearchResult {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

function MembersCard({
  org,
  isStaff,
  onChanged,
}: {
  org: OrganisationDetail;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const results = useQuery({
    enabled: isStaff && search.trim().length > 1,
    queryKey: ["user-search", search],
    queryFn: () =>
      api<{ results: UserSearchResult[] }>("/api/auth/users/", {
        query: { search },
      }),
  });

  const addMember = useMutation({
    mutationFn: (userId: number) =>
      api(`/api/organisations/${org.slug}/add_member/`, {
        method: "POST",
        body: { user_id: userId },
      }),
    onSuccess: () => {
      setSearch("");
      setError(null);
      onChanged();
    },
    onError: () => setError("Couldn't add that member."),
  });

  const removeMember = useMutation({
    mutationFn: (userId: number) =>
      api(`/api/organisations/${org.slug}/remove_member/`, {
        method: "POST",
        body: { user_id: userId },
      }),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: () => setError("Couldn't remove that member."),
  });

  const existingIds = new Set(org.members.map((m) => m.id));

  return (
    <div className="card p-4">
      <h2 className="heading-sub mb-2">Members</h2>
      {org.members.length === 0 ? (
        <p className="text-sm text-muted">No members yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {org.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <div className="font-medium">
                  {m.first_name || m.last_name ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : m.username}
                </div>
                <div className="text-xs text-muted">{m.email || m.username}</div>
              </div>
              {isStaff && (
                <button
                  type="button"
                  onClick={() => removeMember.mutate(m.id)}
                  disabled={removeMember.isPending}
                  className="btn-ghost text-xs text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isStaff && (
        <div className="mt-4 border-t border-border pt-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Add member (search by name/email/username)</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
          {results.data && results.data.results.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded border border-border">
              {results.data.results.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                  <div>
                    <div className="font-medium">
                      {u.first_name || u.last_name ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : u.username}
                    </div>
                    <div className="text-xs text-muted">{u.email || u.username}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addMember.mutate(u.id)}
                    disabled={addMember.isPending || existingIds.has(u.id)}
                    className="btn-ghost text-xs disabled:opacity-50"
                  >
                    {existingIds.has(u.id) ? "Already a member" : "Add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

const GOAL_METRIC_LABELS: Record<OrgGoal["metric"], string> = {
  events: "Events",
  interactions: "Interactions",
  unique_visitors: "Unique visitors",
};

function GoalsCard({ org }: { org: OrganisationDetail }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<OrgGoal["metric"]>("events");
  const [targetValue, setTargetValue] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const goals = useQuery({
    queryKey: ["org-goals", org.id],
    queryFn: () =>
      api<Paginated<OrgGoal>>("/api/organisations/goals/", {
        query: { organisation: org.id, ordering: "-period_end" },
      }),
  });

  const createGoal = useMutation({
    mutationFn: () =>
      api<OrgGoal>("/api/organisations/goals/", {
        method: "POST",
        body: {
          organisation: org.id,
          metric,
          target_value: Number(targetValue),
          period_start: periodStart,
          period_end: periodEnd,
        },
      }),
    onSuccess: () => {
      setShowForm(false);
      setTargetValue("");
      setPeriodStart("");
      setPeriodEnd("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["org-goals", org.id] });
    },
    onError: (e) => {
      setError(
        e instanceof ApiError && typeof (e.body as any)?.detail === "string"
          ? (e.body as any).detail
          : "Couldn't create that goal."
      );
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (goalId: number) => api(`/api/organisations/goals/${goalId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-goals", org.id] }),
  });

  const rows = goals.data?.results ?? [];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="heading-sub mb-2">Goals</h2>
        {org.can_edit && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-ghost text-xs">
            {showForm ? "Cancel" : "+ New goal"}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGoal.mutate();
          }}
          className="mb-4 grid gap-2 rounded border border-border p-3 sm:grid-cols-2"
        >
          <label className="text-sm">
            <span className="mb-1 block text-muted">Metric</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as OrgGoal["metric"])}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            >
              {Object.entries(GOAL_METRIC_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Target value</span>
            <input
              type="number"
              min={1}
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Period start</span>
            <input
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Period end</span>
            <input
              type="date"
              required
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createGoal.isPending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {createGoal.isPending ? "Saving…" : "Create goal"}
            </button>
          </div>
        </form>
      )}

      {goals.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No goals set for this organisation yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((g) => (
            <GoalProgressRow
              key={g.id}
              goal={g}
              orgId={org.id}
              canEdit={org.can_edit}
              onDelete={() => deleteGoal.mutate(g.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalProgressRow({
  goal,
  orgId,
  canEdit,
  onDelete,
}: {
  goal: OrgGoal;
  orgId: number;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const progress = useQuery({
    queryKey: ["goal-progress", goal.id],
    queryFn: () =>
      api<{ event_count: number; interaction_count: number; unique_visitors: number }>(
        "/api/analytics/stats/summary/",
        { query: { org: orgId, date_from: goal.period_start, date_to: goal.period_end } }
      ),
  });

  const actualByMetric: Record<OrgGoal["metric"], number | undefined> = {
    events: progress.data?.event_count,
    interactions: progress.data?.interaction_count,
    unique_visitors: progress.data?.unique_visitors,
  };
  const actual = actualByMetric[goal.metric];
  const pct = actual !== undefined ? Math.min(100, Math.round((actual / goal.target_value) * 100)) : 0;
  const met = actual !== undefined && actual >= goal.target_value;

  return (
    <li>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">
          {GOAL_METRIC_LABELS[goal.metric]} — {goal.period_start} to {goal.period_end}
        </span>
        <span className="tabular-nums text-muted">
          {actual === undefined ? "…" : actual.toLocaleString()} / {goal.target_value.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded bg-border/40">
        <div
          className={`h-2 rounded ${met ? "bg-green-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {canEdit && (
        <button type="button" onClick={onDelete} className="mt-1 text-xs text-red-600 hover:underline">
          Delete
        </button>
      )}
    </li>
  );
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface ReportSubscription {
  organisation: number;
  frequency: "off" | "weekly" | "monthly";
  weekday: number;
  day_of_month: number;
  last_sent_at: string | null;
}

function ReportsCard({ org }: { org: OrganisationDetail }) {
  const qc = useQueryClient();

  const sub = useQuery({
    queryKey: ["report-subscription", org.id],
    queryFn: () => api<ReportSubscription>(`/api/analytics/reports/organisations/${org.id}/subscription/`),
  });

  const update = useMutation({
    mutationFn: (patch: Partial<ReportSubscription>) =>
      api<ReportSubscription>(`/api/analytics/reports/organisations/${org.id}/subscription/`, {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (data) => qc.setQueryData(["report-subscription", org.id], data),
  });

  const downloadUrl = `/api/analytics/reports/organisations/${org.id}/pdf/`;

  return (
    <div className="card p-4">
      <h2 className="heading-sub mb-2">Reports</h2>
      <p className="text-sm text-muted mb-3">
        A comprehensive PDF of this organisation&rsquo;s activity — download on demand, or subscribe members to an
        automatic digest.
      </p>
      <a
        href={downloadUrl}
        className="btn-ghost text-xs border border-border inline-block mb-4"
        target="_blank"
        rel="noreferrer"
      >
        Download PDF (last 30 days)
      </a>

      {org.can_edit && sub.data && (
        <div className="grid gap-2 sm:grid-cols-2 border-t border-border pt-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Email digest</span>
            <select
              value={sub.data.frequency}
              onChange={(e) => update.mutate({ frequency: e.target.value as ReportSubscription["frequency"] })}
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            >
              <option value="off">Off</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {sub.data.frequency === "weekly" && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Send on</span>
              <select
                value={sub.data.weekday}
                onChange={(e) => update.mutate({ weekday: Number(e.target.value) })}
                className="w-full rounded border border-border bg-transparent px-2 py-1"
              >
                {WEEKDAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sub.data.frequency === "monthly" && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Day of month</span>
              <input
                type="number"
                min={1}
                max={28}
                value={sub.data.day_of_month}
                onChange={(e) => update.mutate({ day_of_month: Number(e.target.value) })}
                className="w-full rounded border border-border bg-transparent px-2 py-1"
              />
            </label>
          )}
          {sub.data.last_sent_at && (
            <p className="text-xs text-muted sm:col-span-2">
              Last sent: {new Date(sub.data.last_sent_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EditPanel({
  org,
  isStaff,
  onSaved,
}: {
  org: OrganisationDetail;
  isStaff: boolean;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(org.name);
  const [website, setWebsite] = useState(org.website);
  const [description, setDescription] = useState(org.description);
  const [isPartner, setIsPartner] = useState(org.is_partner);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  useEffect(() => {
    setName(org.name);
    setWebsite(org.website);
    setDescription(org.description);
    setIsPartner(org.is_partner);
  }, [org.id, org.name, org.website, org.description, org.is_partner]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<unknown>(`/api/organisations/${org.slug}/`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      onSaved();
      window.setTimeout(() => setSaved(false), 1500);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setSaved(false);
    },
  });

  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { name, website, description };
        if (isStaff) body.is_partner = isPartner;
        save.mutate(body);
      }}
    >
      <h2 className="heading-sub mb-3">Edit organisation</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-transparent px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded border border-border bg-transparent px-2 py-1"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-muted">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-transparent px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={isPartner}
            disabled={!isStaff}
            onChange={(e) => setIsPartner(e.target.checked)}
          />
          <span>
            Partner organisation
            {!isStaff && (
              <span className="ml-1 text-xs text-muted">(staff only)</span>
            )}
          </span>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        {isStaff && (
          <button
            type="button"
            onClick={() => setShowMergeModal(true)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10"
          >
            Merge with another org...
          </button>
        )}
        <span className="text-xs text-muted">
          Parent / sub-org links are managed in the Django admin.
        </span>
      </div>

      {showMergeModal && (
        <OrgMergeModal
          sourceOrg={org}
          onMerge={(targetSlug: string) => {
            setShowMergeModal(false);
            navigate(`/organisations/${targetSlug}`);
          }}
          onCancel={() => setShowMergeModal(false)}
        />
      )}
    </form>
  );
}

function OrgMergeModal({
  sourceOrg,
  onMerge,
  onCancel,
}: {
  sourceOrg: OrganisationDetail;
  onMerge: (targetSlug: string) => void;
  onCancel: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const organisations = useQuery({
    queryKey: ["organisations-list", searchQuery],
    queryFn: () =>
      api<Paginated<OrganisationDetail>>("/api/organisations/", {
        query: { search: searchQuery, page_size: 100 },
      }),
  });

  const mergeMutation = useMutation({
    mutationFn: async (targetSlug: string) => {
      return api<unknown>(`/api/organisations/${sourceOrg.slug}/merge_into/`, {
        method: "POST",
        body: { target: targetSlug },
      });
    },
    onSuccess: () => {
      if (selectedTarget) {
        onMerge(selectedTarget);
      }
    },
  });

  const results = organisations.data?.results ?? [];
  const filteredResults = results.filter((o: OrganisationDetail) => o.slug !== sourceOrg.slug);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card max-w-md space-y-4 p-4">
        <h3 className="font-medium">Merge organisation</h3>
        <p className="text-sm text-muted">
          This will merge <strong>{sourceOrg.name}</strong> into another organisation. All events, locations, and sub-organisations will be transferred. This action cannot be undone.
        </p>
        <div>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Search organisations</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Organisation name..."
              className="w-full rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
        </div>
        {organisations.isLoading ? (
          <p className="text-sm text-muted">Searching...</p>
        ) : filteredResults.length === 0 ? (
          <p className="text-sm text-muted">No organisations found.</p>
        ) : (
          <div>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Merge into</span>
              <select
                value={selectedTarget ?? ""}
                onChange={(e) => setSelectedTarget(e.target.value || null)}
                className="w-full rounded border border-border bg-transparent px-2 py-1"
              >
                <option value="">Select an organisation...</option>
                {filteredResults.map((o: OrganisationDetail) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {selectedTarget && (
          <div>
            <label className="text-sm">
              <span className="mb-1 block text-muted">
                Type "{sourceOrg.name}" to confirm
              </span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded border border-border bg-transparent px-2 py-1"
              />
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={mergeMutation.isPending}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-border/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              selectedTarget && mergeMutation.mutate(selectedTarget)
            }
            disabled={
              mergeMutation.isPending ||
              !selectedTarget ||
              confirmText !== sourceOrg.name
            }
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {mergeMutation.isPending ? "Merging..." : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
