import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AddAccount from "./AddAccount";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: apiMock };
});

vi.mock("../lib/auth", () => ({
  useMe: () => ({ data: { id: 1, username: "staffer", is_staff: true, is_superuser: false } }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("AddAccount", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/organisations/") {
        return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      }
      return Promise.resolve({ id: 2, username: "newperson", is_staff: false, is_superuser: false });
    });
  });

  it("renders the required fields", () => {
    renderWithClient(<AddAccount />);
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
  });

  it("does not show the staff checkbox for non-superusers", () => {
    renderWithClient(<AddAccount />);
    expect(screen.queryByText("Grant staff access")).not.toBeInTheDocument();
  });

  it("disables submit until required fields are filled and passwords match", async () => {
    const user = userEvent.setup();
    renderWithClient(<AddAccount />);
    const submit = screen.getByRole("button", { name: /create account/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Username"), "newperson");
    await user.type(screen.getByLabelText("Email"), "newperson@example.com");
    await user.type(screen.getByLabelText("Password"), "a-strong-password");
    await user.type(screen.getByLabelText("Confirm password"), "a-strong-password");

    expect(submit).toBeEnabled();
  });

  it("submits the expected payload to the create-account endpoint", async () => {
    const user = userEvent.setup();
    renderWithClient(<AddAccount />);

    await user.type(screen.getByLabelText("Username"), "newperson");
    await user.type(screen.getByLabelText("Email"), "newperson@example.com");
    await user.type(screen.getByLabelText("Password"), "a-strong-password");
    await user.type(screen.getByLabelText("Confirm password"), "a-strong-password");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      const call = apiMock.mock.calls.find(([path]) => path === "/api/auth/accounts/");
      expect(call).toBeTruthy();
    });

    const [, opts] = apiMock.mock.calls.find(([path]) => path === "/api/auth/accounts/")!;
    expect(opts.method).toBe("POST");
    expect(opts.body).toMatchObject({
      username: "newperson",
      email: "newperson@example.com",
      password: "a-strong-password",
      is_staff: false,
      organisation_ids: [],
    });

    expect(await screen.findByText(/created successfully/i)).toBeInTheDocument();
  });
});
