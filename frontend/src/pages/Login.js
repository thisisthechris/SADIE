import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    if (isLoading)
        return null;
    if (me)
        return _jsx(Navigate, { to: "/", replace: true });
    const submit = async (e) => {
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
        }
        catch (e2) {
            setErr(e2 instanceof ApiError && e2.status === 401
                ? "Invalid username or password."
                : "Sign-in failed.");
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen grid place-items-center px-4", children: _jsxs("form", { onSubmit: submit, className: "card p-6 w-full max-w-sm space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-semibold", children: "SADIE" }), _jsx("p", { className: "text-sm text-muted", children: "Sign in to continue." })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "text-xs text-muted", children: "Username" }), _jsx("input", { value: u, onChange: (e) => setU(e.target.value), autoFocus: true, autoComplete: "username", className: "input mt-1" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "text-xs text-muted", children: "Password" }), _jsx("input", { type: "password", value: p, onChange: (e) => setP(e.target.value), autoComplete: "current-password", className: "input mt-1" })] }), err && _jsx("div", { className: "text-sm text-red-500", children: err }), _jsx("button", { type: "submit", disabled: busy, className: "btn-primary w-full", children: busy ? "Signing in…" : "Sign in" })] }) }));
}
