import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";

const spinStyle = `
  @keyframes spin-icon {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spin-icon {
    animation: spin-icon 0.6s linear forwards;
  }
`;

export default function AccountMenu() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await api("/api/auth/logout/", { method: "POST" });
    qc.removeQueries({ queryKey: ["me"] });
    nav("/login");
  };

  if (!me) return null;

  return (
    <>
      <style>{spinStyle}</style>
      <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="p-1.5 -m-1.5 rounded-md hover:bg-border/40 transition-colors"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={"text-muted " + (open ? "spin-icon" : "")}
          style={{
            animation: open ? "spin-icon 0.6s linear forwards" : "none",
          }}
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[200px] rounded-md border border-border bg-bg shadow-lg z-40 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs uppercase tracking-widest font-display text-muted">
              Plymouth Culture
            </div>
            <div className="text-sm font-medium text-fg mt-1">{me.username}</div>
          </div>
          <button
            onClick={handleLogout}
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-border/40 text-fg transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
      </div>
    </>
  );
}
