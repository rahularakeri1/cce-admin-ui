import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb } from "../mocks/handlers";
import RoleDetailPage, { RoleMenusTab, RolePermissionsTabPlaceholder } from "./RoleDetailPage";

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
            <Route path="permissions" element={<RolePermissionsTabPlaceholder />} />
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

  it("has a Permissions tab that is an explicit placeholder until Milestone 4", async () => {
    renderAt("/roles/r-2/permissions");
    expect(await screen.findByText(/not built yet — Milestone 4/i)).toBeInTheDocument();
  });

  it("says so when the role does not exist", async () => {
    renderAt("/roles/r-404");
    expect(await screen.findByText("Role not found.")).toBeInTheDocument();
  });
});
