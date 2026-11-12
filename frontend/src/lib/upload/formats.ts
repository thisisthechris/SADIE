/**
 * Recognised partner CSV formats, ported from imports/parsers.py.
 *
 * Each mapper reads only the columns it needs and returns a ``ParsedRow`` that
 * still holds the email (needed for hashing in the browser). ``toUploadRow``
 * then builds the payload from an explicit allowlist, so names, emails,
 * booking references, notes and full postcodes can never be serialised.
 */
import { postcodeSector } from "./postcode";

export interface ParsedRow {
  email: string;
  postcode: string;
  eventTitle: string;
  eventDate: string; // YYYY-MM-DD
  purchaseDate: string | null;
  ticketQuantity: number;
  attendedCount: number;
  ticketPrice: number | null;
  venueName: string | null;
  hasTicketData: boolean;
}

/** The only fields sent to the server for each booking. */
export interface UploadRow {
  client_hash: string;
  postcode_sector: string;
  event_title: string;
  event_date: string;
  purchase_date: string | null;
  ticket_quantity: number;
  attended_count: number;
  ticket_price: string | null;
  venue_name: string | null;
  has_ticket_data: boolean;
}

export type SkipReason = "missing email" | "missing or invalid postcode" | "missing or invalid date" | "missing event";

export interface CsvFormat {
  id: string;
  label: string;
  header: string[];
  /** Columns holding personal data, shown as "stays on your device". */
  personalColumns: string[];
  /** Columns the mapper reads (postcodes only as a sector; emails only as a hash). */
  usedColumns: string[];
  map: (r: Record<string, string>) => ParsedRow | SkipReason;
}

// ── value helpers (mirror _parse_dt / _to_int / _to_price) ──────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse common export date formats to YYYY-MM-DD (UK day-first for slashed dates). */
export function toIsoDate(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}

function ymd(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function toInt(value: string, fallback: number): number {
  const n = parseFloat((value ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toPrice(value: string): number | null {
  const n = parseFloat((value ?? "").trim().replace(/[£,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const text = (v: string | undefined) => (v ?? "").trim();

function base(
  r: Record<string, string>,
  cols: { email: string; postcode: string; event: string; date: string },
): Pick<ParsedRow, "email" | "postcode" | "eventTitle" | "eventDate"> | SkipReason {
  const email = text(r[cols.email]);
  const postcode = text(r[cols.postcode]);
  const eventTitle = text(r[cols.event]);
  const eventDate = toIsoDate(r[cols.date]);
  if (!email) return "missing email";
  if (!postcodeSector(postcode)) return "missing or invalid postcode";
  if (!eventDate) return "missing or invalid date";
  if (!eventTitle) return "missing event";
  return { email, postcode, eventTitle, eventDate };
}

// ── formats ──────────────────────────────────────────────────────────────────

export const FORMATS: CsvFormat[] = [
  {
    id: "eventbrite",
    label: "Eventbrite",
    header: ["Order_ID", "Event_Name", "Event_Date", "First_Name", "Last_Name", "Email", "Postcode", "Ticket_Type", "Quantity", "Ticket_Price", "Purchase_Date", "Attendance_Status"],
    personalColumns: ["Order_ID", "First_Name", "Last_Name", "Email", "Postcode"],
    usedColumns: ["Event_Name",  "Event_Date",  "Postcode",  "Quantity",  "Ticket_Price",  "Purchase_Date",  "Attendance_Status"],
    map: (r) => {
      const b = base(r, { email: "Email", postcode: "Postcode", event: "Event_Name", date: "Event_Date" });
      if (typeof b === "string") return b;
      const qty = toInt(r.Quantity, 1);
      const status = text(r.Attendance_Status);
      return {
        ...b,
        purchaseDate: toIsoDate(r.Purchase_Date),
        ticketQuantity: qty,
        attendedCount: status === "Attended" || status === "Partial" ? qty : 0,
        ticketPrice: toPrice(r.Ticket_Price),
        venueName: null,
        hasTicketData: true,
      };
    },
  },
  {
    id: "digitickets",
    label: "Digitickets",
    header: ["Booking_Reference", "Booking_Date", "Visit", "Email", "Postcode", "Ticket_Type", "Quantity", "Order_Value", "Donation", "Gift_Aid", "Promo_Code"],
    personalColumns: ["Booking_Reference", "Email", "Postcode", "Gift_Aid"],
    usedColumns: ["Visit",  "Booking_Date",  "Postcode",  "Quantity",  "Order_Value"],
    map: (r) => {
      const b = base(r, { email: "Email", postcode: "Postcode", event: "Visit", date: "Booking_Date" });
      if (typeof b === "string") return b;
      const qty = toInt(r.Quantity, 1);
      const orderValue = toPrice(r.Order_Value);
      return {
        ...b,
        purchaseDate: b.eventDate,
        ticketQuantity: qty,
        attendedCount: qty,
        ticketPrice: orderValue !== null && qty > 0 ? Math.round((orderValue / qty) * 100) / 100 : null,
        venueName: null,
        hasTicketData: true,
      };
    },
  },
  {
    id: "monday",
    label: "Monday.com CRM",
    header: ["Item", "Contact_Name", "Email", "Postcode", "Event", "Event_Date", "Status", "Comments"],
    personalColumns: ["Item", "Contact_Name", "Email", "Postcode", "Comments"],
    usedColumns: ["Event",  "Event_Date",  "Postcode",  "Status"],
    map: (r) => {
      const b = base(r, { email: "Email", postcode: "Postcode", event: "Event", date: "Event_Date" });
      if (typeof b === "string") return b;
      return {
        ...b,
        purchaseDate: b.eventDate,
        ticketQuantity: 1,
        attendedCount: text(r.Status) === "Attended" ? 1 : 0,
        ticketPrice: null,
        venueName: null,
        hasTicketData: false,
      };
    },
  },
  {
    id: "theatre",
    label: "Theatre Box Office",
    header: ["Booking_ID", "Customer_Email", "Customer_Postcode", "Customer_Name", "Performance", "Performance_Date", "Venue", "Tickets", "Seat_Category", "Booking_Channel", "Membership_Status", "Attendance"],
    personalColumns: ["Booking_ID", "Customer_Email", "Customer_Postcode", "Customer_Name", "Membership_Status"],
    usedColumns: ["Performance",  "Performance_Date",  "Customer_Postcode",  "Venue",  "Tickets",  "Attendance"],
    map: (r) => {
      const b = base(r, { email: "Customer_Email", postcode: "Customer_Postcode", event: "Performance", date: "Performance_Date" });
      if (typeof b === "string") return b;
      const tickets = toInt(r.Tickets, 1);
      return {
        ...b,
        purchaseDate: b.eventDate,
        ticketQuantity: tickets,
        attendedCount: text(r.Attendance) ? toInt(r.Attendance, tickets) : tickets,
        ticketPrice: null,
        venueName: text(r.Venue) || null,
        hasTicketData: true,
      };
    },
  },
  {
    id: "museum-attendance",
    label: "Museum Attendance Register",
    header: ["Booking_Reference", "Event", "Date", "Name", "Email", "Postcode", "Tickets_Booked", "Attended", "Notes"],
    personalColumns: ["Booking_Reference", "Name", "Email", "Postcode", "Notes"],
    usedColumns: ["Event",  "Date",  "Postcode",  "Tickets_Booked",  "Attended"],
    map: (r) => {
      const b = base(r, { email: "Email", postcode: "Postcode", event: "Event", date: "Date" });
      if (typeof b === "string") return b;
      const tickets = toInt(r.Tickets_Booked, 1);
      return {
        ...b,
        purchaseDate: b.eventDate,
        ticketQuantity: tickets,
        attendedCount: toInt(r.Attended, tickets),
        ticketPrice: null,
        venueName: null,
        hasTicketData: true,
      };
    },
  },
  {
    id: "museum-booking",
    label: "Museum Booking Export",
    header: ["Booking_Reference", "Session", "Visit_Date", "Email", "Postcode", "Adults", "Children", "Total_Attendees", "Booking_Date"],
    personalColumns: ["Booking_Reference", "Email", "Postcode"],
    usedColumns: ["Session",  "Visit_Date",  "Postcode",  "Total_Attendees",  "Booking_Date"],
    map: (r) => {
      const b = base(r, { email: "Email", postcode: "Postcode", event: "Session", date: "Visit_Date" });
      if (typeof b === "string") return b;
      const total = toInt(r.Total_Attendees, 1);
      return {
        ...b,
        purchaseDate: toIsoDate(r.Booking_Date) ?? b.eventDate,
        ticketQuantity: total,
        attendedCount: total,
        ticketPrice: null,
        venueName: null,
        hasTicketData: true,
      };
    },
  },
];

/** Exact header match, like the server's HEADER_PARSERS lookup. */
export function detectFormat(header: string[]): CsvFormat | null {
  const key = header.map((h) => h.trim()).join("|");
  return FORMATS.find((f) => f.header.join("|") === key) ?? null;
}

/** Build the upload payload from an explicit allowlist — nothing else is copied. */
export function toUploadRow(row: ParsedRow, clientHash: string): UploadRow {
  return {
    client_hash: clientHash,
    postcode_sector: postcodeSector(row.postcode),
    event_title: row.eventTitle,
    event_date: row.eventDate,
    purchase_date: row.purchaseDate,
    ticket_quantity: row.ticketQuantity,
    attended_count: row.attendedCount,
    ticket_price: row.ticketPrice === null ? null : row.ticketPrice.toFixed(2),
    venue_name: row.venueName,
    has_ticket_data: row.hasTicketData,
  };
}
