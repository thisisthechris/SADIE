import { useMe } from "../lib/auth";
import { useFilters } from "../lib/filters";

/**
 * Simple toggle between "My Organisation" (user's first member org) and
 * "City Wide" (no org filter). Only rendered when the logged-in user has
 * at least one member organisation.
 */
export default function OrgToggle() {
  const { data: me } = useMe();
  const f = useFilters();

  const orgs = me?.member_organisations ?? [];
  if (orgs.length === 0) return null;

  // If user has multiple orgs, use the first; the toggle sets to that org ID.
  const myOrg = orgs[0];
  const isMine = f.org === String(myOrg.id);

  return (
    <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium">
      <button
        onClick={() => f.set({ org: String(myOrg.id) })}
        className={`px-3 py-1 rounded-md transition-colors ${
          isMine
            ? "bg-accent text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
        title={`Filter to ${myOrg.name}`}
      >
        {myOrg.name}
      </button>
      <button
        onClick={() => f.set({ org: "" })}
        className={`px-3 py-1 rounded-md transition-colors ${
          !isMine
            ? "bg-accent text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
        title="Show all organisations"
      >
        City Wide
      </button>
    </div>
  );
}
