import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useMe } from "../lib/auth";
import type { Paginated } from "../lib/types";

type OrgOption = { id: number; name: string; is_partner: boolean };

type CreatedUser = {
  id: number;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
};

const emptyForm = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  confirmPassword: "",
  isStaff: false,
};

export default function AddAccount() {
  const { data: me } = useMe();
  const orgs = useQuery({
    queryKey: ["organisations-for-account-form"],
    queryFn: () =>
      api<Paginated<OrgOption>>("/api/organisations/", {
        query: { page_size: 200, ordering: "name" },
      }),
  });

  const [form, setForm] = useState(emptyForm);
  const [orgIds, setOrgIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const canSubmit = useMemo(
    () =>
      form.username.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.password.length > 0 &&
      form.password === form.confirmPassword,
    [form]
  );

  const mutation = useMutation({
    mutationFn: () =>
      api<CreatedUser>("/api/auth/accounts/", {
        method: "POST",
        body: {
          username: form.username.trim(),
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          password: form.password,
          is_staff: form.isStaff,
          organisation_ids: Array.from(orgIds),
        },
      }),
    onSuccess: (user) => {
      setCreated(user);
      setForm(emptyForm);
      setOrgIds(new Set());
      setError(null);
    },
    onError: (e) => {
      setError(
        e instanceof ApiError && typeof (e.body as any)?.detail === "string"
          ? (e.body as any).detail
          : "Failed to create account."
      );
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    mutation.mutate();
  };

  const toggleOrg = (id: number) =>
    setOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="heading-main">Add account</h1>
        <p className="body-lg">
          Create a login for a colleague or partner. They'll get a notification email (no
          password included) pointing them at the self-service password reset if they ever
          need to change it.
        </p>
      </div>

      {created && (
        <div className="card p-4 text-sm text-emerald-500">
          Account <strong>{created.username}</strong> created successfully.
        </div>
      )}

      <form onSubmit={submit} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-muted">Username</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="off"
              className="input mt-1"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="off"
              className="input mt-1"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">First name</span>
            <input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Last name</span>
            <input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              className="input mt-1"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Confirm password</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              className="input mt-1"
              required
            />
          </label>
        </div>

        <div>
          <span className="text-xs text-muted">Organisations</span>
          <div className="mt-1 max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
            {(orgs.data?.results ?? []).map((org) => (
              <label key={org.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={orgIds.has(org.id)}
                  onChange={() => toggleOrg(org.id)}
                />
                {org.name}
              </label>
            ))}
            {orgs.isLoading && <div className="text-xs text-muted">Loading organisations…</div>}
          </div>
        </div>

        {me?.is_superuser && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isStaff}
              onChange={(e) => setForm((f) => ({ ...f, isStaff: e.target.checked }))}
            />
            Grant staff access
          </label>
        )}

        {error && <div className="text-sm text-red-500">{error}</div>}

        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="btn-primary"
        >
          {mutation.isPending ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
