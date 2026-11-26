import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mocks/server";
import { mockDb } from "./mocks/handlers";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderApp(path = "/users") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sidebar = () => screen.getByRole("navigation", { name: "Admin tabs" });
const linkNames = () => within(sidebar()).queryAllByRole("link").map((a) => a.textContent);
const location = () => screen.getByTestId("location").textContent;

describe("App shell — role-aware sidebar", () => {
  it("builds the sidebar from GET /me/menus?console=ADMIN, in the API's order", async () => {
    renderApp();
    expect(await within(sidebar()).findByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(linkNames()).toEqual(["Users", "Roles", "Menus", "Protocols"]);
    expect(within(sidebar()).getByRole("link", { name: "Protocols" })).toHaveAttribute("href", "/protocols");
    expect(mockDb.meMenusCalls).toEqual(["ADMIN"]);
  });

  it("shows only the tabs the user's roles carry — a Protocols-only user sees just Protocols", async () => {
    mockDb.myAdminMenuKeys = ["admin-protocols"];
    renderApp("/protocols");
    await within(sidebar()).findByRole("link", { name: "Protocols" });
    expect(linkNames()).toEqual(["Protocols"]);
    expect(screen.getByRole("heading", { name: "Protocols" })).toBeInTheDocument();
  });

  it("redirects a path the user may not open to their first allowed tab", async () => {
    mockDb.myAdminMenuKeys = ["admin-protocols"];
    renderApp("/users");
    expect(await screen.findByRole("heading", { name: "Protocols" })).toBeInTheDocument();
    expect(location()).toBe("/protocols");
  });

  it("redirects a forbidden sub-page too (a user detail URL typed by hand)", async () => {
    mockDb.myAdminMenuKeys = ["admin-protocols"];
    renderApp("/users/new");
    await screen.findByRole("heading", { name: "Protocols" });
    expect(location()).toBe("/protocols");
  });

  it("uses the first allowed tab as the landing page", async () => {
    mockDb.myAdminMenuKeys = ["admin-roles", "admin-protocols"];
    renderApp("/");
    await waitFor(() => expect(location()).toBe("/roles"));
  });

  it("keeps a user on a tab they are allowed to open", async () => {
    mockDb.myAdminMenuKeys = ["admin-roles", "admin-protocols"];
    renderApp("/protocols");
    await screen.findByRole("heading", { name: "Protocols" });
    expect(location()).toBe("/protocols");
  });

  it("shows a 'no access' screen with Sign out, and no tabs, when the user has none", async () => {
    mockDb.myAdminMenuKeys = [];
    renderApp();
    expect(await screen.findByRole("heading", { name: /No access to the admin console/i })).toBeInTheDocument();
    expect(linkNames()).toEqual([]);
    expect(within(screen.getByRole("status")).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("treats a 403 from /me/menus as 'no access' — an answer, not an error to retry", async () => {
    mockDb.failNext = { status: 403, code: "FORBIDDEN", message: "Access denied" };
    renderApp();
    expect(await screen.findByRole("heading", { name: /No access to the admin console/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows an error with Retry — never a wrong sidebar — when the menus call fails, then recovers", async () => {
    mockDb.failNext = { status: 500, code: "INTERNAL", message: "boom" };
    renderApp();
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not load your menus/);
    expect(linkNames()).toEqual([]);

    await userEvent.setup().click(retry);
    expect(await within(sidebar()).findByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("does not show a tab the API returns but this build can't draw", async () => {
    mockDb.menus.push({
      id: "m-x", menuKey: "admin-future", label: "Future", path: "/future", icon: "Icon", console: "ADMIN", sortOrder: 9, isActive: true,
    });
    mockDb.myAdminMenuKeys = ["admin-future", "admin-protocols"];
    renderApp("/");
    await within(sidebar()).findByRole("link", { name: "Protocols" });
    expect(linkNames()).toEqual(["Protocols"]);
    await waitFor(() => expect(location()).toBe("/protocols")); // no redirect loop onto the unknown tab
  });

  it("re-checks the menus when the browser tab regains focus, so a removed tab disappears", async () => {
    renderApp();
    await within(sidebar()).findByRole("link", { name: "Users" });

    mockDb.myAdminMenuKeys = []; // a Super Admin just took this user's tabs away
    window.dispatchEvent(new Event("visibilitychange")); // react-query listens on window

    expect(await screen.findByRole("heading", { name: /No access to the admin console/i })).toBeInTheDocument();
    expect(linkNames()).toEqual([]);
  });
});

describe("App shell — signed-in user", () => {
  it("shows the real signed-in user from GET /me once it resolves", async () => {
    renderApp();
    expect(await screen.findByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("(SUPER_ADMIN)")).toBeInTheDocument();
  });

  it("explains a 403 (no local admin account) instead of saying 'Not signed in'", async () => {
    server.use(
      http.get("*/admin/v1/me", () =>
        HttpResponse.json({ error: { code: "FORBIDDEN", message: "No local user" } }, { status: 403 }),
      ),
    );
    renderApp();
    expect(await screen.findByText(/has no access to the admin console/i)).toBeInTheDocument();
  });

  it("shows 'no roles' for a user with an empty role list", async () => {
    server.use(
      http.get("*/admin/v1/me", () =>
        HttpResponse.json({ data: { id: "u-9", username: "norole", roles: [], facilityScope: null } }),
      ),
    );
    renderApp();
    expect(await screen.findByText("norole")).toBeInTheDocument();
    expect(screen.getByText("(no roles)")).toBeInTheDocument();
  });
});
