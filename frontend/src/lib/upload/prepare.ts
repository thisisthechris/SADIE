/**
 * Turns a CSV file's text into the PII-free payload. Pure and DOM-free so it
 * can run in a Web Worker (see prepare.worker.ts) and in unit tests.
 */
import { parseCsv, toRecords } from "./csv";
import { detectFormat, toUploadRow, type CsvFormat, type SkipReason, type UploadRow } from "./formats";
import { clientHash, sha256Hex } from "./hash";

export interface Prepared {
  format: { id: string; label: string; personalColumns: string[] };
  header: string[];
  rows: UploadRow[];
  skipped: Partial<Record<SkipReason, number>>;
  skippedCount: number;
  totalRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  attendees: number;
  /** Two example emails and their hashes for the "scramble" animation; never uploaded. */
  hashExamples: { masked: string; hash: string }[];
}

export type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; header: string[] };

export type ProgressFn = (done: number, total: number) => void;

/** "jane.doe@example.com" → "j•••@e•••.com", for on-screen examples only. */
export function maskEmail(email: string): string {
  const [user, domain = ""] = email.trim().split("@");
  const [host, ...rest] = domain.split(".");
  return `${user.slice(0, 1)}•••@${host.slice(0, 1)}•••${rest.length ? "." + rest.join(".") : ""}`;
}

export async function prepareCsv(text: string, onProgress?: ProgressFn): Promise<PrepareResult> {
  const { header, records } = toRecords(parseCsv(text));
  const format: CsvFormat | null = detectFormat(header);
  if (!format) return { ok: false, header };

  const rows: UploadRow[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const hashCache = new Map<string, string>();
  const hashExamples: Prepared["hashExamples"] = [];
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let attendees = 0;

  for (let i = 0; i < records.length; i++) {
    const parsed = format.map(records[i]);
    if (typeof parsed === "string") {
      skipped[parsed] = (skipped[parsed] ?? 0) + 1;
    } else {
      const key = parsed.email.trim().toLowerCase();
      let h = hashCache.get(key);
      if (!h) {
        h = await clientHash(parsed.email);
        hashCache.set(key, h);
        if (hashExamples.length < 2) hashExamples.push({ masked: maskEmail(parsed.email), hash: h });
      }
      rows.push(toUploadRow(parsed, h));
      attendees += parsed.attendedCount;
      if (!dateFrom || parsed.eventDate < dateFrom) dateFrom = parsed.eventDate;
      if (!dateTo || parsed.eventDate > dateTo) dateTo = parsed.eventDate;
    }
    if (onProgress && (i % 250 === 0 || i === records.length - 1)) onProgress(i + 1, records.length);
  }

  return {
    ok: true,
    prepared: {
      format: { id: format.id, label: format.label, personalColumns: format.personalColumns },
      header,
      rows,
      skipped,
      skippedCount: records.length - rows.length,
      totalRows: records.length,
      dateFrom,
      dateTo,
      attendees,
      hashExamples,
    },
  };
}

export function fileFingerprint(bytes: ArrayBuffer): Promise<string> {
  return sha256Hex(bytes);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
