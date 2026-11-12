/**
 * Postcode handling. Only the sector (outward code + first inward digit,
 * e.g. "PL4 5") ever leaves the browser. Mirrors analytics/geocoding.py and
 * imports/parsers.py::_clean_postcode.
 */

/** Fix exports that write 'PL4 5 HN' instead of 'PL4 5HN'. */
function cleanPostcode(raw: string): string {
  const parts = (raw ?? "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (parts.length === 3 && /^\d$/.test(parts[1]) && /^[A-Z]{2}$/.test(parts[2])) {
    return `${parts[0]} ${parts[1]}${parts[2]}`;
  }
  return parts.join(" ");
}

export function normalizePostcode(raw: string): string {
  let pc = cleanPostcode(raw);
  if (!pc) return "";
  if ((pc.length === 6 || pc.length === 7) && !pc.includes(" ")) pc = `${pc.slice(0, -3)} ${pc.slice(-3)}`;
  return pc.split(/\s+/).join(" ");
}

const SECTOR_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9]$/;

/** Postcode sector such as "PL4 5", or "" if the postcode can't be reduced to one. */
export function postcodeSector(raw: string): string {
  const pc = normalizePostcode(raw);
  const [outward, inward] = pc.split(" ");
  if (!outward || !inward) return "";
  const sector = `${outward} ${inward[0]}`;
  return SECTOR_RE.test(sector) ? sector : "";
}
