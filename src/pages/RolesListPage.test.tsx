import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb } from "../mocks/handlers";
import RolesListPage from "./RolesListPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RolesListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openForm() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "+ New Role" }));
  return user;
}

describe("RolesListPage", () => {
  it("lists roles and shows SUPER_ADMIN locked with no delete action at all", async () => {
    renderPage();
    const row = (await screen.findByText("SUPER_ADMIN")).closest("tr")!;
    expect(within(row).getByLabelText("System role (locked)")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit Super Administrator" })).toBeInTheDocument();
    // Not merely disabled — absent.
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("warns that the name is permanent before submitting", async () => {
    renderPage();
    await openForm();
    expect(screen.getByText(/cannot be renamed after creation/i)).toBeInTheDocument();
  });

  it("rejects a name that is not UPPER_SNAKE_CASE without calling the server", async () => {
    let posted = false;
    server.use(http.post("*/admin/v1/roles", () => ((posted = true), HttpResponse.json({}, { status: 201 }))));
    renderPage();
    const user = await openForm();

    await user.type(screen.getByLabelText(/^Name/), "facility admin");
    await user.type(screen.getByLabelText(/Display name/), "Facility Admin");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText(/Use UPPER_SNAKE_CASE/)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("creates a role and then shows it from a real refetch of the list", async () => {
    renderPage();
    const user = await openForm();

    await user.type(screen.getByLabelText(/^Name/), "FACILITY_ADMIN");
    await user.type(screen.getByLabelText(/Display name/), "Facility Administrator");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText("FACILITY_ADMIN")).toBeInTheDocument();
    expect(mockDb.roles.map((r) => r.name)).toContain("FACILITY_ADMIN");
    // Form closes once the server has accepted it.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Create role" })).not.toBeInTheDocument());
  });

  it("shows a server-side duplicate-name 409 inline on the name field, even though Zod passed", async () => {
    renderPage();
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Name/), "SUPER_ADMIN");
    await user.type(screen.getByLabelText(/Display name/), "Imposter");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    const alert = await screen.findByText(/role with this name already exists/i);
    expect(alert).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
    // The form stays open so the admin can fix the name.
    expect(screen.getByRole("button", { name: "Create role" })).toBeInTheDocument();
  });

  it("deletes a non-system role only after an explicit confirm", async () => {
    mockDb.roles.push({
      id: "r-9",
      name: "TEMP_ROLE",
      displayName: "Temp",
      description: null,
      isSystem: false,
      createdAt: "",
      updatedAt: "",
    });
    renderPage();
    const user = userEvent.setup();
    const row = (await screen.findByText("TEMP_ROLE")).closest("tr")!;

    await user.click(within(row).getByRole("button", { name: "Delete" }));
    expect(mockDb.roles.some((r) => r.id === "r-9")).toBe(true); // nothing deleted yet
    await user.click(within(row).getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(screen.queryByText("TEMP_ROLE")).not.toBeInTheDocument());
    expect(mockDb.roles.some((r) => r.id === "r-9")).toBe(false);
  });

  it("explains ROLE_IN_USE inline when users still hold the role", async () => {
    mockDb.roles.push({
      id: "r-8",
      name: "BUSY_ROLE",
      displayName: "Busy",
      description: null,
      isSystem: false,
      createdAt: "",
      updatedAt: "",
    });
    mockDb.rolesInUse.add("r-8");
    renderPage();
    const user = userEvent.setup();
    const row = (await screen.findByText("BUSY_ROLE")).closest("tr")!;

    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await user.click(within(row).getByRole("button", { name: "Confirm delete" }));

    expect(await within(row).findByText(/users still hold this role/i)).toBeInTheDocument();
    expect(screen.getByText("BUSY_ROLE")).toBeInTheDocument();
  });

  it("shows an inline 403 instead of a table when listing is forbidden", async () => {
    server.use(
      http.get("*/admin/v1/roles", () =>
        HttpResponse.json({ error: { code: "FORBIDDEN", message: "no" } }, { status: 403 }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows ROLE_NAME_RESERVED inline when the name belongs to an existing gateway permission set", async () => {
    renderPage();
    const user = await openForm();
    await user.type(screen.getByLabelText(/^Name/), "COMPLIANCE_READ");
    await user.type(screen.getByLabelText(/Display name/), "Compliance");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText(/belongs to an existing gateway permission set/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
    expect(mockDb.roles.map((r) => r.name)).not.toContain("COMPLIANCE_READ");
  });
});
