import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { delay, http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDb, syncState } from "../mocks/handlers";
import UserCreatePage from "./UserCreatePage";

function renderPage() {
  mockDb.roles.push(
    { id: "r-2", name: "FACILITY_ADMIN", displayName: "Facility Administrator", description: null, isSystem: false, createdAt: "", updatedAt: "" },
    { id: "r-3", name: "DATA_OPS", displayName: "Data ops", description: null, isSystem: false, createdAt: "", updatedAt: "" },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type U = ReturnType<typeof userEvent.setup>;
async function fill(user: U, over: Partial<Record<"username" | "email" | "first" | "last" | "facility", string>> = {}) {
  await user.type(screen.getByLabelText(/^Username/), over.username ?? "mira.live");
  await user.type(screen.getByLabelText(/^Email/), over.email ?? "mira@example.org");
  await user.type(screen.getByLabelText(/^First name/), over.first ?? "Mira");
  await user.type(screen.getByLabelText(/^Last name/), over.last ?? "Live");
  if (over.facility) await user.type(screen.getByLabelText(/^Facility/), over.facility);
}
const submit = (user: U) => user.click(screen.getByRole("button", { name: "Create user" }));

describe("UserCreatePage", () => {
  it("creates a user with the picked roles and shows what happened", async () => {
    renderPage();
    const user = userEvent.setup();
    await fill(user, { facility: "Kigali" });
    await user.click(await screen.findByLabelText(/FACILITY_ADMIN/));
    await submit(user);

    expect(await screen.findByRole("heading", { name: "User created" })).toBeInTheDocument();
    expect(screen.getByText(/Mira Live \(mira@example.org\) was created with FACILITY_ADMIN/)).toBeInTheDocument();
    expect(screen.getByText(/invitation email was sent/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View user" })).toHaveAttribute("href", `/users/${mockDb.users[0].id}`);
    expect(mockDb.lastUserPost).toMatchObject({ username: "mira.live", email: "mira@example.org", facilityScope: "Kigali", roleIds: ["r-2"] });
    expect(mockDb.users).toHaveLength(1);
  });

  it("validates client-side and sends nothing: required fields, email format, username", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByLabelText(/FACILITY_ADMIN/);

    await submit(user);
    expect(await screen.findAllByText(/is required|At least 3 characters/)).not.toHaveLength(0);

    await user.type(screen.getByLabelText(/^Username/), "has space");
    await user.type(screen.getByLabelText(/^Email/), "not-an-email");
    await submit(user);
    expect(await screen.findByText(/Letters, digits and/)).toBeInTheDocument();
    expect(screen.getByText(/valid email address/)).toBeInTheDocument();
    expect(mockDb.lastUserPost).toBeNull();
  });

  it("shows EMAIL_IN_USE inline on the email field", async () => {
    mockDb.users.push({
      id: "u-1", username: "taken", email: "mira@example.org", firstName: "T", lastName: "T", status: "ACTIVE",
      roles: [], facilityScope: null, lastLoginAt: null, createdAt: "2026-11-01T00:00:00Z",
    });
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/user with this email already exists/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("heading", { name: "User created" })).not.toBeInTheDocument();
    expect(mockDb.users).toHaveLength(1); // nothing new
  });

  it("shows USERNAME_IN_USE inline on the username field", async () => {
    mockDb.users.push({
      id: "u-1", username: "mira.live", email: "other@example.org", firstName: "T", lastName: "T", status: "ACTIVE",
      roles: [], facilityScope: null, lastLoginAt: null, createdAt: "2026-11-01T00:00:00Z",
    });
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/username is already taken/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveAttribute("aria-invalid", "true");
  });

  it("explains an unsynced role on the roles field and points to the Permissions tab", async () => {
    mockDb.unsyncedRoleIds.add("r-3");
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await user.click(await screen.findByLabelText(/DATA_OPS/));
    await submit(user);

    expect(await screen.findByText(/not in Keycloak yet: DATA_OPS/)).toBeInTheDocument();
    expect(screen.getByText(/Permissions tab/)).toBeInTheDocument();
    expect(mockDb.users).toHaveLength(0);
  });

  it("on a Keycloak failure shows the shared notice in its 'nothing was saved' wording — with no Re-sync", async () => {
    syncState.createUserKeycloakShouldFail = true;
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/Keycloak sync failed — nothing was saved/)).toBeInTheDocument();
    expect(screen.queryByText(/your change was saved/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-sync" })).not.toBeInTheDocument();
    expect(mockDb.users).toHaveLength(0);
    // The form is still there with what was typed, so submitting again is one click.
    expect(screen.getByLabelText(/^Email/)).toHaveValue("mira@example.org");
  });

  it("still succeeds when only the invitation email failed, with a warning banner", async () => {
    syncState.createUserEmailShouldFail = true;
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    expect(await screen.findByRole("heading", { name: "User created" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Invitation email could not be sent/);
    expect(screen.queryByText(/invitation email was sent/i)).not.toBeInTheDocument();
    expect(mockDb.users).toHaveLength(1);
  });

  it("'Create another' returns to an empty form", async () => {
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);
    await user.click(await screen.findByRole("button", { name: "Create another" }));

    expect(screen.getByRole("button", { name: "Create user" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
  });

  it("shows an inline 403 when creating is forbidden", async () => {
    server.use(http.post("*/admin/v1/users", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "no" } }, { status: 403 })));
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/You can't create users/)).toBeInTheDocument();
  });

  it("shows a pending state and blocks a second submit while the request is in flight", async () => {
    server.use(
      http.post("*/admin/v1/users", async () => {
        await delay(150);
        return HttpResponse.json({ error: { code: "KEYCLOAK_SYNC_FAILED", message: "x" } }, { status: 502 });
      }),
    );
    renderPage();
    const user = userEvent.setup();
    await fill(user);
    await submit(user);

    const pending = await screen.findByRole("button", { name: "Creating…" });
    expect(pending).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled()); // settles after the 502
  });
});
