import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb } from "../mocks/handlers";
import RoleDetailPage, { RoleMenusTab } from "./RoleDetailPage";
import RolePermissionsTab from "./RolePermissionsTab";

function renderAt(path: string) {
  mockDb.roles.push({
    id: "r-2",
    name: "FACILITY_ADMIN",
    displayName: "Facility Administrator",
    description: null,
    isSystem: false,
    createdAt: "",
    updatedAt: "",
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/roles/:id" element={<RoleDetailPage />}>
            <Route index element={<RoleMenusTab />} />
            <Route path="permissions" element={<RolePermissionsTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });

describe("RoleDetailPage — Menus tab", () => {
  it("lists the full catalog as checkboxes, with the role's saved selection ticked", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    renderAt("/roles/r-2");

    expect(await screen.findByRole("heading", { name: /Facility Administrator/ })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Dashboard/)).toBeChecked();
    expect(screen.getByLabelText(/Facilities/)).not.toBeChecked();
    expect(screen.getByLabelText(/Compliance/)).not.toBeChecked();
  });

  it("keeps Save disabled until the selection actually differs from what was fetched", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await screen.findByLabelText(/Dashboard/);

    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByLabelText(/Facilities/));
    expect(saveButton()).toBeEnabled();
    await user.click(screen.getByLabelText(/Facilities/)); // back to the fetched set
    expect(saveButton()).toBeDisabled();
  });

  it("sends the COMPLETE menuIds set on save and is disabled again straight after", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await screen.findByLabelText(/Dashboard/);

    await user.click(screen.getByLabelText(/Facilities/));
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastMenusPut).not.toBeNull());
    expect(mockDb.lastMenusPut!.body.menuIds.sort()).toEqual(["m-1", "m-2"]); // untouched m-1 included
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getByLabelText(/Dashboard/)).toBeChecked();
    expect(screen.getByLabelText(/Facilities/)).toBeChecked();
  });

  it("can clear every menu by saving an empty set", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText(/Dashboard/));
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastMenusPut?.body.menuIds).toEqual([]));
  });

  it("shows the server's error and keeps the unsaved selection when save fails", async () => {
    server.use(
      http.put("*/admin/v1/roles/:id/menus", () =>
        HttpResponse.json({ error: { code: "MENU_NOT_FOUND", message: "No menu with id x" } }, { status: 404 }),
      ),
    );
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText(/Compliance/));
    await user.click(saveButton());

    expect(await screen.findByText(/No menu with id x/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Compliance/)).toBeChecked();
    expect(saveButton()).toBeEnabled();
  });

  it("routes the Permissions tab to the real permissions editor", async () => {
    renderAt("/roles/r-2/permissions");
    expect(await screen.findByText("No permissions yet.")).toBeInTheDocument();
  });

  it("says so when the role does not exist", async () => {
    renderAt("/roles/r-404");
    expect(await screen.findByText("Role not found.")).toBeInTheDocument();
  });
});

describe("RoleDetailPage — Menus tab, admin tab rules (Milestone 7)", () => {
  it("groups the catalog under Insights and Admin console", async () => {
    renderAt("/roles/r-2");
    await screen.findByLabelText(/Dashboard/);

    const insights = within(screen.getByRole("region", { name: "Insights" }));
    const admin = within(screen.getByRole("region", { name: "Admin console" }));
    expect(insights.getByLabelText(/Dashboard/)).toBeInTheDocument();
    expect(insights.queryByLabelText(/Users/)).not.toBeInTheDocument();
    expect(admin.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("greys out Users, Roles and Menus on a custom role, but leaves Protocols tickable", async () => {
    renderAt("/roles/r-2");
    await screen.findByLabelText(/Dashboard/);

    for (const label of [/^Users/, /^Roles/, /^Menus/]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
    expect(screen.getAllByText("Super Admin only")).toHaveLength(3);
    expect(screen.getByLabelText(/Protocols/)).toBeEnabled();
  });

  it("lets a custom role take the Protocols tab and sends it in the complete set", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await screen.findByLabelText(/Dashboard/);

    await user.click(screen.getByLabelText(/Protocols/));
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastMenusPut?.body.menuIds).toEqual(["m-1", "m-a4"]));
    expect(saveButton()).toBeDisabled();
  });

  it("shows all four admin tabs ticked and locked on SUPER_ADMIN, with the insights menus still editable", async () => {
    mockDb.roleMenus["r-1"] = ["m-1", "m-a1", "m-a2", "m-a3", "m-a4"];
    renderAt("/roles/r-1");
    await screen.findByLabelText(/Dashboard/);

    const admin = within(screen.getByRole("region", { name: "Admin console" }));
    for (const box of admin.getAllByRole("checkbox")) {
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    expect(screen.getAllByText("Always on for Super Admin")).toHaveLength(4);
    expect(screen.getByLabelText(/Dashboard/)).toBeEnabled();
  });

  it("always sends SUPER_ADMIN's four admin tabs when its insights menus change", async () => {
    mockDb.roleMenus["r-1"] = ["m-1", "m-a1", "m-a2", "m-a3", "m-a4"];
    renderAt("/roles/r-1");
    const user = userEvent.setup();
    await screen.findByLabelText(/Dashboard/);

    await user.click(screen.getByLabelText(/Facilities/));
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastMenusPut?.body.menuIds).toEqual(["m-1", "m-2", "m-a1", "m-a2", "m-a3", "m-a4"]));
  });

  it("shows the server's 409 inline if it refuses a save the UI let through", async () => {
    mockDb.roleMenus["r-2"] = ["m-1"];
    server.use(
      http.put("*/admin/v1/roles/:id/menus", () =>
        HttpResponse.json(
          { error: { code: "ADMIN_MENU_SUPER_ADMIN_ONLY", message: "Users can only be assigned to SUPER_ADMIN" } },
          { status: 409 },
        ),
      ),
    );
    renderAt("/roles/r-2");
    const user = userEvent.setup();
    await screen.findByLabelText(/Dashboard/);

    await user.click(screen.getByLabelText(/Facilities/));
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/can only be assigned to SUPER_ADMIN/);
  });
});
