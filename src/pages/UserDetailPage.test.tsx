import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb, syncState, type MockUser } from "../mocks/handlers";
import UserDetailPage from "./UserDetailPage";

// /me (see handlers.ts) answers as user "u-1", so a user with id "u-1" is "yourself".
function seed(over: Partial<MockUser> = {}): MockUser {
  const u: MockUser = {
    id: "u-7",
    username: "mira.live",
    email: "mira@example.org",
    firstName: "Mira",
    lastName: "Live",
    status: "ACTIVE",
    roles: ["FACILITY_ADMIN"],
    facilityScope: "Kigali",
    lastLoginAt: "2026-11-20T10:00:00Z",
    createdAt: "2026-11-01T10:00:00Z",
    ...over,
  };
  mockDb.users.push(u);
  mockDb.roles.push(
    { id: "r-2", name: "FACILITY_ADMIN", displayName: "Facility Administrator", description: null, isSystem: false, createdAt: "", updatedAt: "" },
    { id: "r-3", name: "DATA_OPS", displayName: "Data ops", description: null, isSystem: false, createdAt: "", updatedAt: "" },
  );
  return u;
}

function renderPage(id = "u-7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/users/${id}`]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: string) => screen.getByRole("region", { name });
const fail = (status: number, code: string, message: string) => (mockDb.failNext = { status, code, message });

describe("UserDetailPage", () => {
  it("shows the user and the four independent sections", async () => {
    seed();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Mira Live" })).toBeInTheDocument();
    expect(screen.getAllByText(/mira\.live/).length).toBeGreaterThan(0);
    for (const name of ["Profile", "Roles", "Status", "Password & invitation"]) expect(section(name)).toBeInTheDocument();
  });

  it("says so when the user does not exist", async () => {
    renderPage("u-404");
    expect(await screen.findByText("User not found.")).toBeInTheDocument();
  });

  // ---- profile --------------------------------------------------------------------------------

  it("keeps Save profile disabled until something changes, then sends the edit", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const save = within(section("Profile")).getByRole("button", { name: "Save profile" });

    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText("Facility"));
    await user.type(screen.getByLabelText("Facility"), "Huye");
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(mockDb.lastUserPut).toMatchObject({ firstName: "Mira", email: "mira@example.org", facilityScope: "Huye" });
    expect(mockDb.users[0].facilityScope).toBe("Huye");
    await waitFor(() => expect(save).toBeDisabled()); // the saved values are the new baseline
  });

  it("refetches the user from the server after a save, and shows what is actually stored", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const fetchesBefore = mockDb.userFetches;

    await user.clear(screen.getByLabelText("First name"));
    await user.type(screen.getByLabelText("First name"), "Maya");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("heading", { name: "Maya Live" })).toBeInTheDocument(); // header refreshed
    expect(mockDb.userFetches).toBeGreaterThan(fetchesBefore); // a real GET, not just the PUT response
    expect(screen.getByLabelText("First name")).toHaveValue("Maya");
    expect(screen.getByText("Profile saved.")).toBeInTheDocument();
  });

  it("refetches after a role change and after a status change too", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });

    let before = mockDb.userFetches;
    await user.click(await within(section("Roles")).findByLabelText(/DATA_OPS/));
    await user.click(within(section("Roles")).getByRole("button", { name: "Save roles" }));
    await waitFor(() => expect(mockDb.userFetches).toBeGreaterThan(before));

    before = mockDb.userFetches;
    await user.click(within(section("Status")).getByRole("button", { name: "Deactivate user" }));
    await user.click(within(section("Status")).getByRole("button", { name: "Confirm deactivate" }));
    await waitFor(() => expect(mockDb.userFetches).toBeGreaterThan(before));
    expect(await screen.findByText(/This account is/)).toHaveTextContent("Inactive");
  });

  it("warns that changing the email re-verifies it, only while the email is being changed", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });

    expect(screen.queryByText(/marks it unverified/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "new@example.org");
    expect(screen.getByText(/marks it unverified and sends a verification email/)).toBeInTheDocument();
  });

  it("shows EMAIL_IN_USE on the email field", async () => {
    seed();
    mockDb.users.push({ ...mockDb.users[0], id: "u-8", username: "other", email: "taken@example.org" });
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "taken@example.org");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Another user already has this email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("an email change whose verification email failed is a warning, not an error", async () => {
    seed();
    syncState.createUserEmailShouldFail = true;
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "new@example.org");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText(/verification email could not be sent/)).toBeInTheDocument();
    expect(mockDb.users[0].email).toBe("new@example.org"); // still saved
  });

  it("validates client-side and sends nothing: blank name, bad email", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });

    await user.clear(screen.getByLabelText("First name"));
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText(/valid email address/)).toBeInTheDocument();
    expect(mockDb.lastUserPut).toBeNull();
  });

  it("a Keycloak failure on the profile shows the 'nothing was saved' notice and keeps what was typed", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    fail(502, "KEYCLOAK_SYNC_FAILED", "down");

    await user.clear(screen.getByLabelText("Facility"));
    await user.type(screen.getByLabelText("Facility"), "Huye");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await within(section("Profile")).findByText(/nothing was saved/)).toBeInTheDocument();
    expect(screen.getByLabelText("Facility")).toHaveValue("Huye");
  });

  // ---- roles ----------------------------------------------------------------------------------

  it("shows the current roles ticked and keeps Save roles disabled until the set changes", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const roles = section("Roles");
    expect(await within(roles).findByLabelText(/FACILITY_ADMIN/)).toBeChecked();
    expect(within(roles).getByLabelText(/DATA_OPS/)).not.toBeChecked();
    const save = within(roles).getByRole("button", { name: "Save roles" });

    expect(save).toBeDisabled();
    await user.click(within(roles).getByLabelText(/DATA_OPS/));
    expect(save).toBeEnabled();
    await user.click(within(roles).getByLabelText(/DATA_OPS/)); // back to the original set
    expect(save).toBeDisabled();
  });

  it("sends the COMPLETE role set (including untouched roles) and is disabled again after saving", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const roles = section("Roles");

    await user.click(await within(roles).findByLabelText(/DATA_OPS/));
    await user.click(within(roles).getByRole("button", { name: "Save roles" }));

    await waitFor(() => expect(mockDb.lastRolesPut).not.toBeNull());
    expect([...mockDb.lastRolesPut!].sort()).toEqual(["r-2", "r-3"]); // the unchanged FACILITY_ADMIN is still sent
    await waitFor(() => expect(within(roles).getByRole("button", { name: "Save roles" })).toBeDisabled());
    expect(within(roles).getByLabelText(/DATA_OPS/)).toBeChecked();
  });

  it("shows ROLE_NOT_SYNCED and LAST_SUPER_ADMIN on the roles section and keeps the unsaved choice", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const roles = section("Roles");

    fail(409, "ROLE_NOT_SYNCED", "Role(s) not in Keycloak yet: DATA_OPS — open the role's Permissions tab and Save or Re-sync first");
    await user.click(await within(roles).findByLabelText(/DATA_OPS/));
    await user.click(within(roles).getByRole("button", { name: "Save roles" }));
    expect(await within(roles).findByText(/not in Keycloak yet: DATA_OPS/)).toBeInTheDocument();
    expect(within(roles).getByLabelText(/DATA_OPS/)).toBeChecked();

    fail(409, "LAST_SUPER_ADMIN", "This is the last active SUPER_ADMIN; doing this would leave nobody able to administer the console");
    await user.click(within(roles).getByRole("button", { name: "Save roles" }));
    expect(await within(roles).findByText(/last active SUPER_ADMIN/)).toBeInTheDocument();
  });

  // ---- status ---------------------------------------------------------------------------------

  it("deactivating needs an explicit confirm, then flips to Reactivate while the roles stay", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const status = section("Status");

    await user.click(within(status).getByRole("button", { name: "Deactivate user" }));
    expect(mockDb.lastStatusPatch).toBeNull(); // nothing yet
    await user.click(within(status).getByRole("button", { name: "Confirm deactivate" }));

    expect(await within(status).findByRole("button", { name: "Reactivate user" })).toBeInTheDocument();
    expect(mockDb.lastStatusPatch).toBe("INACTIVE");
    expect(mockDb.users[0].roles).toEqual(["FACILITY_ADMIN"]); // kept

    await user.click(within(status).getByRole("button", { name: "Reactivate user" }));
    await user.click(within(status).getByRole("button", { name: "Confirm reactivate" }));
    expect(await within(status).findByRole("button", { name: "Deactivate user" })).toBeInTheDocument();
    expect(mockDb.lastStatusPatch).toBe("ACTIVE");
  });

  it("cancelling the confirm sends nothing", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const status = section("Status");

    await user.click(within(status).getByRole("button", { name: "Deactivate user" }));
    await user.click(within(status).getByRole("button", { name: "Cancel" }));

    expect(within(status).getByRole("button", { name: "Deactivate user" })).toBeInTheDocument();
    expect(mockDb.lastStatusPatch).toBeNull();
  });

  it("offers no Deactivate button on your own account", async () => {
    seed({ id: "u-1", username: "jdoe" }); // /me answers as u-1
    renderPage("u-1");
    await screen.findByRole("heading", { name: "Mira Live" });

    await waitFor(() => expect(within(section("Status")).getByText("You can't deactivate your own account.")).toBeInTheDocument());
    expect(within(section("Status")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the server's refusal (last SUPER_ADMIN) inline and leaves the user active", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const status = section("Status");
    fail(409, "LAST_SUPER_ADMIN", "This is the last active SUPER_ADMIN; doing this would leave nobody able to administer the console");

    await user.click(within(status).getByRole("button", { name: "Deactivate user" }));
    await user.click(within(status).getByRole("button", { name: "Confirm deactivate" }));

    expect(await within(status).findByText(/last active SUPER_ADMIN/)).toBeInTheDocument();
    expect(mockDb.users[0].status).toBe("ACTIVE");
  });

  // ---- password -------------------------------------------------------------------------------

  it("sends the reset email only after a confirm, and says where it went", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const pw = section("Password & invitation");

    await user.click(within(pw).getByRole("button", { name: "Send password reset email" }));
    expect(mockDb.resetCalls).toBe(0);
    await user.click(within(pw).getByRole("button", { name: "Confirm send" }));

    expect(await within(pw).findByText("Email sent to mira@example.org.")).toBeInTheDocument();
    expect(mockDb.resetCalls).toBe(1);
  });

  it("calls it 'Resend invitation' for a user who has never signed in — same endpoint", async () => {
    seed({ lastLoginAt: null });
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const pw = section("Password & invitation");

    await user.click(within(pw).getByRole("button", { name: "Resend invitation" }));
    await user.click(within(pw).getByRole("button", { name: "Confirm send" }));

    expect(await within(pw).findByText(/Email sent to/)).toBeInTheDocument();
    expect(mockDb.resetCalls).toBe(1);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("is unavailable for an inactive user, with the reason", async () => {
    seed({ status: "INACTIVE" });
    renderPage();
    await screen.findByRole("heading", { name: "Mira Live" });
    const pw = section("Password & invitation");

    expect(within(pw).getByText(/Reactivate this user first/)).toBeInTheDocument();
    expect(within(pw).queryByRole("button")).not.toBeInTheDocument();
  });

  it("an email failure shows the server's message and does not disturb the other sections", async () => {
    seed();
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const pw = section("Password & invitation");
    fail(502, "KEYCLOAK_SYNC_FAILED", "Keycloak failed while sending the invitation email: HTTP 500");

    await user.click(within(pw).getByRole("button", { name: "Send password reset email" }));
    await user.click(within(pw).getByRole("button", { name: "Confirm send" }));

    expect(await within(pw).findByText(/nothing was saved/)).toBeInTheDocument();
    expect(within(section("Roles")).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(section("Status")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an inline 403 when an action is forbidden", async () => {
    seed();
    server.use(http.patch("*/admin/v1/users/:id/status", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "no" } }, { status: 403 })));
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Mira Live" });
    const status = section("Status");

    await user.click(within(status).getByRole("button", { name: "Deactivate user" }));
    await user.click(within(status).getByRole("button", { name: "Confirm deactivate" }));

    expect((await within(status).findAllByText(/don't have permission/i)).length).toBeGreaterThan(0);
  });
});
