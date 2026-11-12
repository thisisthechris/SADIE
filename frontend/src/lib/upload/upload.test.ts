import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { FORMATS, detectFormat, toIsoDate } from "./formats";
import { clientHash } from "./hash";
import { postcodeSector } from "./postcode";
import { chunk, maskEmail, prepareCsv } from "./prepare";

// Shared with imports/tests_hashing.py — change both together.
const CLIENT_VECTOR = "19c168e17a9846400f8072d2841c3a3e36d7b2592e5179a5671a52f93ffc1bf2";

const csv = (header: string[], ...rows: string[][]) =>
  [header, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");

const fmt = (id: string) => FORMATS.find((f) => f.id === id)!.header;

describe("clientHash", () => {
  it("matches the server's client_hash for the shared vector", async () => {
    expect(await clientHash("  Jane.Doe@Example.com ")).toBe(CLIENT_VECTOR);
  });
});

describe("parseCsv", () => {
  it("handles BOM, quotes, embedded commas/newlines and CRLF", () => {
    expect(parseCsv('\ufeffa,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });
});

describe("postcodeSector", () => {
  it("reduces full and messy postcodes to a sector", () => {
    expect(postcodeSector("pl4 5ab")).toBe("PL4 5");
    expect(postcodeSector("PL45AB")).toBe("PL4 5");
    expect(postcodeSector("PL4 5 HN")).toBe("PL4 5");
    expect(postcodeSector("PL4")).toBe("");
    expect(postcodeSector("not a postcode")).toBe("");
  });
});

describe("toIsoDate", () => {
  it("reads ISO, UK day-first and long dates, rejecting nonsense", () => {
    expect(toIsoDate("2026-01-31")).toBe("2026-01-31");
    expect(toIsoDate("2025-11-29 10:00:00.000003")).toBe("2025-11-29");
    expect(toIsoDate("03/11/2026")).toBe("2026-11-03");
    expect(toIsoDate("3 Nov 2026")).toBe("2026-11-03");
    expect(toIsoDate("31/02/2026")).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });
});

describe("detectFormat", () => {
  it("recognises all six partner exports and nothing else", () => {
    for (const f of FORMATS) expect(detectFormat(f.header)?.id).toBe(f.id);
    expect(detectFormat(["Email", "Postcode"])).toBeNull();
  });
});

describe("prepareCsv", () => {
  const eventbrite = csv(
    fmt("eventbrite"),
    ["EVB-1", "Gig", "2026-01-31", "Jane", "Doe", "jane.doe@example.com", "PL4 5 HN", "GA", "2", "2.85", "2025-11-29 10:00", "Attended"],
    ["EVB-2", "Gig", "2026-02-02", "Bob", "Smith", "bob@example.com", "PL1 2AB", "GA", "1", "0", "2025-12-01", "No Show"],
    ["EVB-3", "Gig", "2026-02-02", "No", "Email", "", "PL1 2AB", "GA", "1", "0", "2025-12-01", "Attended"],
    ["EVB-4", "Gig", "2026-02-02", "Bad", "Code", "x@example.com", "nowhere", "GA", "1", "0", "2025-12-01", "Attended"],
  );

  it("maps rows, counts skips and summarises the file", async () => {
    const result = await prepareCsv(eventbrite);
    if (!result.ok) throw new Error("not recognised");
    const p = result.prepared;
    expect(p.format.label).toBe("Eventbrite");
    expect(p.rows).toHaveLength(2);
    expect(p.skipped).toEqual({ "missing email": 1, "missing or invalid postcode": 1 });
    expect([p.dateFrom, p.dateTo, p.attendees]).toEqual(["2026-01-31", "2026-02-02", 2]);
    expect(p.rows[0]).toEqual({
      client_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      postcode_sector: "PL4 5",
      event_title: "Gig",
      event_date: "2026-01-31",
      purchase_date: "2025-11-29",
      ticket_quantity: 2,
      attended_count: 2,
      ticket_price: "2.85",
      venue_name: null,
      has_ticket_data: true,
    });
    expect(p.rows[1].attended_count).toBe(0);
  });

  it("never puts names, emails, booking refs or full postcodes in the payload", async () => {
    const result = await prepareCsv(eventbrite);
    if (!result.ok) throw new Error("not recognised");
    const body = JSON.stringify({ rows: result.prepared.rows });
    for (const pii of ["jane.doe@example.com", "bob@example.com", "Jane", "Doe", "Smith", "EVB-1", "5HN", "2AB", "@"]) {
      expect(body).not.toContain(pii);
    }
    // Same person → same hash; different people → different hashes.
    const again = await prepareCsv(eventbrite);
    if (!again.ok) throw new Error();
    expect(again.prepared.rows[0].client_hash).toBe(result.prepared.rows[0].client_hash);
    expect(result.prepared.rows[0].client_hash).not.toBe(result.prepared.rows[1].client_hash);
  });

  it("maps the theatre export including venue and attendance", async () => {
    const result = await prepareCsv(
      csv(
        fmt("theatre"),
        ["B1", "a@b.co", "PL1 1AA", "Ann Lee", "Hamlet", "05/11/2026", "Lyric", "3", "Stalls", "Web", "Member", "2"],
      ),
    );
    if (!result.ok) throw new Error();
    expect(result.prepared.rows[0]).toMatchObject({
      event_date: "2026-11-05",
      ticket_quantity: 3,
      attended_count: 2,
      venue_name: "Lyric",
      postcode_sector: "PL1 1",
    });
    expect(JSON.stringify(result.prepared.rows)).not.toMatch(/Ann Lee|a@b\.co|Member/);
  });

  it("returns the header when the format isn't recognised", async () => {
    expect(await prepareCsv("Email,Postcode\nx@y.z,PL1 1AA")).toEqual({ ok: false, header: ["Email", "Postcode"] });
  });
});

describe("helpers", () => {
  it("masks emails for on-screen examples and chunks arrays", () => {
    expect(maskEmail("jane.doe@example.co.uk")).toBe("j•••@e•••.co.uk");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
