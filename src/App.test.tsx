import { describe, expect, it } from "vitest";
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
});
