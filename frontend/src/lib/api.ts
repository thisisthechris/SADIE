/**
 * Tiny fetch wrapper for the SADIE API.
 *
 * - Always sends cookies (session auth).
 * - On state-changing requests, includes the X-CSRFToken header read from the
 *   csrftoken cookie. We bootstrap the cookie via GET /api/auth/csrf/.
 * - 401s are surfaced; the router decides whether to redirect to /login.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

let csrfBootstrapped = false;

async function ensureCsrf() {
  if (csrfBootstrapped || getCookie("csrftoken")) {
    csrfBootstrapped = true;
    return;
  }
  await fetch("/api/auth/csrf/", { credentials: "include" });
  csrfBootstrapped = true;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  if (!SAFE_METHODS.has(method)) {
    await ensureCsrf();
    const token = getCookie("csrftoken");
    if (token) headers["X-CSRFToken"] = token;
  }

  let url = path.startsWith("http") ? path : path;
  if (opts.query) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      usp.set(k, String(v));
    }
    const qs = usp.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body,
  });

  const text = await res.text();
  const payload = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
