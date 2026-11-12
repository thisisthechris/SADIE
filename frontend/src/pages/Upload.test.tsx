import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Upload from "./Upload";
import { FORMATS } from "../lib/upload/formats";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: apiMock };
});

vi.mock("../lib/auth", () => ({
  useMe: () => ({ data: { id: 1, username: "member", is_staff: false } }),
}));

// Run the CSV pipeline on the main thread in tests (jsdom has no workers).
vi.mock("../lib/upload/runPrepare", async () => {
  const { prepareCsv } = await import("../lib/upload/prepare");
  return { prepareInWorker: prepareCsv };
});

const header = FORMATS.find((f) => f.id === "eventbrite")!.header.join(",");
const CSV = [
  header,
  "EVB-1,Gig,2026-11-03,Jane,Doe,jane.doe@example.com,PL4 5HN,GA,2,8.00,2026-10-20,Attended",
  "EVB-2,Gig,2026-11-03,Bob,Smith,bob@example.com,PL1 2AB,GA,1,8.00,2026-10-21,Attended",
].join("\n");

const BATCH = {
  id: 7,
  organisation: 3,
  organisation_name: "Theatre Royal Plymouth",
  uploaded_by: "member",
  source_format: "Eventbrite",
  file_fingerprint: "f".repeat(64),
  file_label: "export.csv",
  status: "complete",
  row_count: 2,
  skipped_count: 0,
  interaction_count: 2,
  date_from: "2026-11-03",
  date_to: "2026-11-03",
  created_at: "2026-11-10T09:00:00Z",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Upload />
    </QueryClientProvider>,
  );
}

async function fileInput() {
  return waitFor(() => {
    const el = document.querySelector('input[type="file"]');
    if (!el) throw new Error("file input not rendered yet");
    return el as HTMLInputElement;
  });
}

function csvFile(text: string) {
  const file = new File([text], "export.csv", { type: "text/csv" });
  // jsdom's File lacks arrayBuffer() in some versions.
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}

describe("Upload page", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/uploads/organisations/") return Promise.resolve({ results: [{ id: 3, name: "Theatre Royal Plymouth" }] });
      if (path === "/api/uploads/") return Promise.resolve({ results: [] });
      if (path === "/api/analytics/data-calendar/") return Promise.resolve({ weeks_with_data: 0, gap_weeks: 52, calendar: [] });
      return Promise.resolve({});
    });
  });

  it("reads the file locally, previews a PII-free payload, then uploads in chunks", async () => {
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/api/uploads/organisations/") return Promise.resolve({ results: [{ id: 3, name: "Theatre Royal Plymouth" }] });
      if (path === "/api/uploads/" && opts?.method === "POST") return Promise.resolve({ ...BATCH, status: "in_progress" });
      if (path === "/api/uploads/") return Promise.resolve({ results: [] });
      if (path.endsWith("/rows/")) return Promise.resolve({ accepted: 2 });
      if (path.endsWith("/complete/")) return Promise.resolve(BATCH);
      return Promise.resolve({ weeks_with_data: 1, gap_weeks: 51, calendar: [] });
    });
    renderPage();

    const input = await fileInput();
    fireEvent.change(input, { target: { files: [csvFile(CSV)] } });

    expect(await screen.findByText("Eventbrite")).toBeInTheDocument();
    expect(screen.getByText(/Exactly what we'll send/)).toBeInTheDocument();
    expect(screen.getByText("First_Name")).toHaveClass("line-through");

    await userEvent.click(screen.getByRole("button", { name: /Upload 2 bookings/ }));
    expect(await screen.findByText(/All done/)).toBeInTheDocument();

    const sent = apiMock.mock.calls.filter(([, o]) => o?.method === "POST").map(([p, o]) => [p, JSON.stringify(o.body ?? {})]);
    expect(sent.map(([p]) => p)).toEqual(["/api/uploads/", "/api/uploads/7/rows/", "/api/uploads/7/complete/"]);
    const everything = sent.map(([, b]) => b).join("\n");
    for (const pii of ["jane.doe@example.com", "bob@example.com", "Jane", "Doe", "Smith", "EVB-1", "5HN", "2AB"]) {
      expect(everything).not.toContain(pii);
    }
    expect(everything).toContain('"postcode_sector":"PL4 5"');
  });

  it("explains unrecognised files", async () => {
    renderPage();
    const input = await fileInput();
    fireEvent.change(input, { target: { files: [csvFile("Name,Email\nJo,jo@x.com")] } });
    expect(await screen.findByText(/don't recognise these columns/)).toBeInTheDocument();
    expect(apiMock.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });
});
