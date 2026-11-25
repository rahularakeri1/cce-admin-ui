import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb, type MockUser } from "../mocks/handlers";
import UsersListPage from "./UsersListPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsersListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let n = 0;
function addUser(over: Partial<MockUser> = {}): MockUser {
  n += 1;
  const u: MockUser = {
    id: `u-${100 + n}`,
    username: `user${n}`,
    email: `user${n}@example.org`,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    status: "ACTIVE",
    roles: [],
    facilityScope: null,
    lastLoginAt: "2026-11-20T10:00:00Z",
    createdAt: new Date(2026, 10, 1, 10, n).toISOString(),
    ...over,
  };
  mockDb.users.push(u);
  return u;
}

describe("UsersListPage", () => {
  it("lists users with their roles, facility and status", async () => {
    addUser({ firstName: "Mira", lastName: "Live", roles: ["FACILITY_ADMIN", "DATA_OPS"], facilityScope: "Kigali" });
    renderPage();

    const row = (await screen.findByText("Mira Live")).closest("tr")!;
    expect(within(row).getByText("FACILITY_ADMIN")).toBeInTheDocument();
    expect(within(row).getByText("DATA_OPS")).toBeInTheDocument();
    expect(within(row).getByText("Kigali")).toBeInTheDocument();
    expect(within(row).getByText("ACTIVE")).toBeInTheDocument();
  });

  it("flags an ACTIVE user who has never logged in as 'Needs attention' — and nobody else", async () => {
    addUser({ firstName: "Never", lastName: "Seen", lastLoginAt: null });
    addUser({ firstName: "Has", lastName: "LoggedIn" });
    addUser({ firstName: "Turned", lastName: "Off", status: "INACTIVE", lastLoginAt: null });
    renderPage();

    const never = (await screen.findByText("Never Seen")).closest("tr")!;
    expect(within(never).getByText("Needs attention")).toBeInTheDocument();
    expect(within(never).getByText("Never")).toBeInTheDocument();
    expect(within(screen.getByText("Has LoggedIn").closest("tr")!).queryByText("Needs attention")).not.toBeInTheDocument();
    expect(within(screen.getByText("Turned Off").closest("tr")!).queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("filters by status and by search, sending the filters to the server", async () => {
    addUser({ firstName: "Zoltan", lastName: "Kovacs" });
    addUser({ firstName: "Ina", lastName: "Ctive", status: "INACTIVE" });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("Zoltan Kovacs");

    await user.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByText("Zoltan Kovacs")).not.toBeInTheDocument());
    expect(screen.getByText("Ina Ctive")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("Zoltan Kovacs")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "kovacs");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByText("Ina Ctive")).not.toBeInTheDocument());
    expect(screen.getByText("Zoltan Kovacs")).toBeInTheDocument();
  });

  it("filters by role using the role picker", async () => {
    mockDb.roles.push({ id: "r-7", name: "DATA_OPS", displayName: "Data ops", description: null, isSystem: false, createdAt: "", updatedAt: "" });
    addUser({ firstName: "Has", lastName: "DataOps", roles: ["DATA_OPS"] });
    addUser({ firstName: "No", lastName: "Roles" });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("Has DataOps");
    await screen.findByRole("option", { name: "DATA_OPS" });

    await user.selectOptions(screen.getByLabelText("Role"), "DATA_OPS");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.queryByText("No Roles")).not.toBeInTheDocument());
    expect(screen.getByText("Has DataOps")).toBeInTheDocument();
  });

  it("paginates on the server: 20 per page, Next/Previous, correct range text", async () => {
    for (let i = 0; i < 25; i++) addUser();
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Showing 1–20 of 25")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(21); // header + 20
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Showing 21–25 of 25")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6); // header + 5
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Showing 1–20 of 25")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    renderPage();
    expect(await screen.findByText("No users match these filters.")).toBeInTheDocument();
    expect(screen.getByText("0 users")).toBeInTheDocument();
  });

  it("links to the create form", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "+ New User" })).toHaveAttribute("href", "/users/new");
  });

  it("shows an inline 403 instead of a table when listing is forbidden", async () => {
    server.use(http.get("*/admin/v1/users", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "no" } }, { status: 403 })));
    renderPage();
    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("links each name to the user's detail page", async () => {
    const u = addUser({ firstName: "Mira", lastName: "Live" });
    renderPage();
    expect(await screen.findByRole("link", { name: "Mira Live" })).toHaveAttribute("href", `/users/${u.id}`);
  });

  it("offers 'Resend invite' only on needs-attention rows, and it calls the reset endpoint", async () => {
    addUser({ firstName: "Never", lastName: "Seen", lastLoginAt: null });
    addUser({ firstName: "Has", lastName: "LoggedIn" });
    renderPage();
    const user = userEvent.setup();

    const never = (await screen.findByText("Never Seen")).closest("tr")!;
    expect(within(screen.getByText("Has LoggedIn").closest("tr")!).queryByRole("button", { name: "Resend invite" })).not.toBeInTheDocument();

    await user.click(within(never).getByRole("button", { name: "Resend invite" }));
    expect(await within(never).findByText("Invitation sent")).toBeInTheDocument();
    expect(mockDb.resetCalls).toBe(1);
  });

  it("marks system accounts with a System badge", async () => {
    addUser({ firstName: "Boot", lastName: "Strap", isSystem: true });
    addUser({ firstName: "Plain", lastName: "User" });
    renderPage();

    const system = (await screen.findByText("Boot Strap")).closest("tr")!;
    expect(within(system).getByText("System")).toBeInTheDocument();
    expect(within(screen.getByText("Plain User").closest("tr")!).queryByText("System")).not.toBeInTheDocument();
  });
});
