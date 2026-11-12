/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and
 * newlines inside quotes, CRLF/LF line endings and a leading UTF-8 BOM.
 * Returns rows as arrays of strings; blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    field = "";
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** Turn parsed rows into objects keyed by the (trimmed) header row. */
export function toRecords(rows: string[][]): { header: string[]; records: Record<string, string>[] } {
  const [rawHeader = [], ...body] = rows;
  const header = rawHeader.map((h) => h.trim());
  const records = body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  return { header, records };
}
