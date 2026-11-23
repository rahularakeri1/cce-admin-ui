import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mocks/server";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/users"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App shell", () => {
  it("renders the static sidebar with Users, Roles and Menus regardless of role", () => {
    renderApp();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Roles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Menus" })).toBeInTheDocument();
  });

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

  it("never calls GET /me/menus — the admin sidebar is static (F-03)", async () => {
    let menusCalled = false;
    server.use(
      http.get("*/admin/v1/me/menus", () => {
        menusCalled = true;
        return HttpResponse.json({ data: [] });
      }),
    );
    renderApp();
    await screen.findByText("jdoe");
    expect(menusCalled).toBe(false);
  });
});
