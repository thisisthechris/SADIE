/**
 * Helpers for showing a chart as "% of total" instead of raw counts.
 * Each key is converted against its own column total, so a chart with
 * several series (e.g. events and interactions) shows each series' share.
 */

export function percentOfTotal<T extends object>(rows: T[], keys: (keyof T)[]): T[] {
  const totals = keys.map((k) => rows.reduce((sum, r) => sum + (Number(r[k]) || 0), 0));
  return rows.map((r) => {
    const out = { ...r };
    keys.forEach((k, i) => {
      out[k] = toPct(Number(r[k]) || 0, totals[i]) as T[keyof T];
    });
    return out;
  });
}

/** Convert each row's values to its share of that row's own total (for 100%-stacked bars). */
export function percentOfRow<T extends object>(rows: T[], keys: (keyof T)[]): T[] {
  return rows.map((r) => {
    const total = keys.reduce((sum, k) => sum + (Number(r[k]) || 0), 0);
    const out = { ...r };
    keys.forEach((k) => {
      if (k in r) out[k] = toPct(Number(r[k]) || 0, total) as T[keyof T];
    });
    return out;
  });
}

function toPct(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

export function valueFormatter(percent: boolean): (value: number) => string {
  return percent ? (v) => `${v}%` : (v) => v.toLocaleString();
}
