/**
 * Browser-side hashing. Must match ``imports/hashing.py::client_hash``:
 * SHA-256 of "sadie-v1:" + the trimmed, lower-cased email, as lowercase hex.
 * The server keys this with a secret before storing it, so the raw email
 * never leaves the browser and the secret never reaches it.
 */
export const CLIENT_HASH_PREFIX = "sadie-v1:";

export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export function clientHash(email: string): Promise<string> {
  return sha256Hex(CLIENT_HASH_PREFIX + normalizeEmail(email));
}
