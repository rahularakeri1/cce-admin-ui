import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MenuFormPage from "../pages/MenuFormPage";
import MenusCatalogPage from "../pages/MenusCatalogPage";

/** The Menus screens wired as App.tsx wires them, so navigating between them is real. */
export function renderMenus(path: string, state?: { saved?: string; highlight?: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/menus" element={<MenusCatalogPage />} />
          <Route path="/menus/new" element={<MenuFormPage />} />
          <Route path="/menus/:id" element={<MenuFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
