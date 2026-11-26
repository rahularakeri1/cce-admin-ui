import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtocolDetailPage from "../pages/ProtocolDetailPage";
import ProtocolsListPage from "../pages/ProtocolsListPage";
import ProtocolUploadPage from "../pages/ProtocolUploadPage";

/** The three Protocols screens wired as App.tsx wires them, so navigation between them is real. */
export function renderProtocols(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/protocols" element={<ProtocolsListPage />} />
          <Route path="/protocols/new" element={<ProtocolUploadPage />} />
          <Route path="/protocols/:id" element={<ProtocolDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A small but realistic PlanDefinition (the real samples are ~14 KB). */
export function planDefinitionText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      resourceType: "PlanDefinition",
      url: "http://openphc.org/PlanDefinition/new-protocol",
      version: "1.0.0",
      name: "NewProtocol",
      title: "A new protocol",
      status: "active",
      action: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      ...overrides,
    },
    null,
    2,
  );
}
