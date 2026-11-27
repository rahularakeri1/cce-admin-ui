import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// cce-admin-ui — Vite dev server on :3002, proxying /admin/v1/* to the real
// cce-admin-service on :8085 (no mocking at the network layer in dev — see
// docs/developer-setup.md). /v1/protocol/* goes to the local GATEWAY on :8090 (Milestone 8): the Protocols page
// calls cce-protocol-service through it with the user's token, as it does in a real environment; the gateway
// routes it to the protocol service on :8091 (cce-admin-service/scripts/run-gateway-local.sh).
// MSW is used only inside unit tests (U4, see vitest.config.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3002,
    proxy: {
      "/admin/v1": "http://localhost:8085",
      "/v1/protocol": "http://localhost:8090",
    },
  },
});
