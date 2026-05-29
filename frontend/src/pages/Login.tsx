import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useMe } from "../lib/auth";

export default function Login() {
  const { data: me, isLoading } = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return null;
  if (me) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/api/auth/login/", {
        method: "POST",
        body: { username: u, password: p },
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/");
    } catch (e2) {
      setErr(
        e2 instanceof ApiError && e2.status === 401
          ? "Invalid username or password."
          : "Sign-in failed."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-bg">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-5">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted font-display mb-1">Plymouth Culture</p>
          <h1 className="text-4xl font-display font-bold text-accent tracking-tight">SADIE</h1>
          <p className="text-sm text-muted mt-1">Sign in to continue.</p>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Username</span>
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoFocus
            autoComplete="username"
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Password</span>
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            className="input mt-1"
          />
        </label>
        {err && <div className="text-sm text-red-500">{err}</div>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
