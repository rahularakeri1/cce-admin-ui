import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RoleDetailPage from "./RoleDetailPage";
import RolePermissionsTab from "./RolePermissionsTab";
import { mockDb, syncState } from "../mocks/handlers";

function renderTab(roleId = "r-2", opts: { isSystem?: boolean } = {}) {
  if (roleId === "r-2") {
    mockDb.roles.push({
      id: "r-2",
      name: "FACILITY_ADMIN",
      displayName: "Facility Administrator",
      description: null,
      isSystem: opts.isSystem ?? false,
      createdAt: "",
      updatedAt: "",
    });
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/roles/${roleId}/permissions`]}>
        <Routes>
          <Route path="/roles/:id" element={<RoleDetailPage />}>
            <Route path="permissions" element={<RolePermissionsTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });
const row = (method: string, uri: string, description: string | null = null, category: string | null = null) => ({
  httpMethod: method,
  uriPattern: uri,
  description,
  category,
});

async function addRow(user: ReturnType<typeof userEvent.setup>, n: number, uri: string, method?: string) {
  await user.click(screen.getByRole("button", { name: "+ Add permission row" }));
  if (method) await user.selectOptions(screen.getByLabelText(`Method, row ${n}`), method);
  await user.type(screen.getByLabelText(`URI pattern, row ${n}`), uri);
}

describe("RolePermissionsTab", () => {
  it("shows the saved rows, and an honest 'status unknown' until you save or re-sync", async () => {
    mockDb.permissions["r-2"] = [{ id: 1, ...row("GET", "/v1/insights/**", "Read insights", "INSIGHTS") }];
    renderTab();

    expect(await screen.findByDisplayValue("/v1/insights/**")).toBeInTheDocument();
    expect(screen.getByDisplayValue("INSIGHTS")).toBeInTheDocument();
    expect(screen.getByText(/Sync status unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/Synced with Keycloak/)).not.toBeInTheDocument();
  });

  it("keeps Save disabled until the rows differ from what was fetched", async () => {
    mockDb.permissions["r-2"] = [{ id: 1, ...row("GET", "/v1/a/**") }];
    renderTab();
    const user = userEvent.setup();
    await screen.findByDisplayValue("/v1/a/**");

    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Category, row 1"), "X");
    expect(saveButton()).toBeEnabled();
    await user.clear(screen.getByLabelText("Category, row 1"));
    expect(saveButton()).toBeDisabled();
  });

  it("saves the COMPLETE set, then shows Synced from the server's response", async () => {
    mockDb.permissions["r-2"] = [{ id: 1, ...row("GET", "/v1/keep/**") }];
    renderTab();
    const user = userEvent.setup();
    await screen.findByDisplayValue("/v1/keep/**");

    await addRow(user, 2, "/v1/events/**", "POST");
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastPermissionsPut).not.toBeNull());
    expect(mockDb.lastPermissionsPut!.body.permissions).toEqual([
      row("GET", "/v1/keep/**"), // the untouched row is still sent
      row("POST", "/v1/events/**"),
    ]);
    expect(await screen.findByText(/Synced with Keycloak/)).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it("on a sync failure keeps the saved rows and shows the shared retry notice (not a toast)", async () => {
    syncState.permissionsSyncShouldFail = true;
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("No permissions yet.");

    await addRow(user, 1, "/v1/saved/**");
    await user.click(saveButton());

    expect(await screen.findByText(/Sync failed — your change was saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-sync" })).toBeInTheDocument();
    // The DB write survived: the row is still on screen, reloaded from the server.
    expect(mockDb.permissions["r-2"]).toHaveLength(1);
    expect(await screen.findByDisplayValue("/v1/saved/**")).toBeInTheDocument();
    expect(screen.queryByText(/Synced with Keycloak/)).not.toBeInTheDocument();
    syncState.permissionsSyncShouldFail = false;
  });

  it("Re-sync clears the failed state once gateway is back, without changing rows", async () => {
    syncState.permissionsSyncShouldFail = true;
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("No permissions yet.");
    await addRow(user, 1, "/v1/x/**");
    await user.click(saveButton());
    await screen.findByText(/Sync failed/);

    await user.click(screen.getByRole("button", { name: "Re-sync" })); // still down
    await waitFor(() => expect(mockDb.resyncCalls).toBe(1));
    expect(await screen.findByText(/Sync failed/)).toBeInTheDocument();

    syncState.permissionsSyncShouldFail = false; // gateway recovers
    await user.click(screen.getByRole("button", { name: "Re-sync" }));

    expect(await screen.findByText(/Synced with Keycloak/)).toBeInTheDocument();
    expect(screen.queryByText(/Sync failed/)).not.toBeInTheDocument();
    expect(mockDb.permissions["r-2"]).toHaveLength(1);
  });

  it("can Re-sync from the unknown state too", async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(/Sync status unknown/);

    await user.click(screen.getByRole("button", { name: "Re-sync" }));

    expect(await screen.findByText(/Synced with Keycloak/)).toBeInTheDocument();
    expect(mockDb.resyncCalls).toBe(1);
  });

  it("validates rows client-side and sends nothing: bad pattern, empty pattern, duplicates", async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("No permissions yet.");

    await addRow(user, 1, "no-leading-slash");
    await user.click(saveButton());
    expect(await screen.findByText(/Must start with \//)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("URI pattern, row 1"));
    await user.click(saveButton());
    expect(await screen.findByText(/URI pattern is required/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("URI pattern, row 1"), "/v1/dup/**");
    await addRow(user, 2, "/v1/dup/**");
    await user.click(saveButton());
    expect(await screen.findByText(/Duplicate of an earlier row/)).toBeInTheDocument();

    expect(mockDb.lastPermissionsPut).toBeNull();
  });

  it("removes a row and sends the remaining set", async () => {
    mockDb.permissions["r-2"] = [
      { id: 1, ...row("GET", "/v1/a/**") },
      { id: 2, ...row("GET", "/v1/b/**") },
    ];
    renderTab();
    const user = userEvent.setup();
    await screen.findByDisplayValue("/v1/a/**");

    await user.click(screen.getByRole("button", { name: "Remove row 1" }));
    await user.click(saveButton());

    await waitFor(() => expect(mockDb.lastPermissionsPut).not.toBeNull());
    expect(mockDb.lastPermissionsPut!.body.permissions).toEqual([row("GET", "/v1/b/**")]);
  });

  it("shows the server's ROLE_IN_USE message inline when emptying a role users still hold", async () => {
    mockDb.permissions["r-2"] = [{ id: 1, ...row("GET", "/v1/a/**") }];
    mockDb.rolesInUse.add("r-2");
    renderTab();
    const user = userEvent.setup();
    await screen.findByDisplayValue("/v1/a/**");

    await user.click(screen.getByRole("button", { name: "Remove row 1" }));
    await user.click(saveButton());

    expect(await screen.findByText(/Users still hold this role/)).toBeInTheDocument();
    expect(screen.queryByText(/Synced with Keycloak/)).not.toBeInTheDocument();
  });

  it("renders a system role read-only: locked note, no inputs, no Save, no Add", async () => {
    mockDb.permissions["r-1"] = [{ id: 1, ...row("GET", "/admin/v1/**", "Admin read", "Admin") }];
    renderTab("r-1");

    expect(await screen.findByText(/System role — its permissions are managed by the platform/)).toBeInTheDocument();
    expect(screen.getByText("/admin/v1/**")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add permission row" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByRole("button")).not.toBeInTheDocument();
  });
});
