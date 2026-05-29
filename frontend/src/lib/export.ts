/**
 * Lightweight client-side export helpers — no extra deps.
 */

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function escapeCsvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  columns: { key: keyof T; label: string }[],
) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsvCell(r[c.key])).join(","))
    .join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
  triggerBlobDownload(blob, filename);
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (blob) triggerBlobDownload(blob, filename);
  }, "image/png");
}
