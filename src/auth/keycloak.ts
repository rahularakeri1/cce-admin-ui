import Keycloak from "keycloak-js";

// Mandatory login, no bypass flag (unlike cce-insights-ui's VITE_AUTH_ENABLED) —
// see docs/architecture-overview.md §1.
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || `${window.location.origin}/auth`,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "cce-admin-ui",
});

let refreshIntervalId: number | undefined;

export async function initAuth(): Promise<void> {
  await keycloak.init({
    onLoad: "login-required",
    pkceMethod: "S256",
  });

  refreshIntervalId = window.setInterval(() => {
    keycloak.updateToken(70).catch(() => {
      // Refresh failed — force a fresh login rather than silently running on a stale/expired token.
      keycloak.login();
    });
  }, 60_000);
}

export function getToken(): string | undefined {
  return keycloak.token;
}

export function getUsername(): string | undefined {
  return keycloak.tokenParsed?.preferred_username;
}

export function logout(): void {
  if (refreshIntervalId) {
    window.clearInterval(refreshIntervalId);
  }
  keycloak.logout();
}

export default keycloak;
