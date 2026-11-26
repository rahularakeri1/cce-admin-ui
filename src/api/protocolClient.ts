import { getToken } from "../auth/keycloak";
import { ApiError } from "./client";

// cce-protocol-service is called THROUGH THE GATEWAY with the user's own token — there is no admin-service
// endpoint in between (Milestone 8). In development the Vite dev server forwards /v1/protocol to the gateway.
const BASE_URL = `${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/protocol`;

/**
 * Three different things can answer here, with three different bodies, so the status decides and the body only
 * supplies wording:
 *  - the protocol service:  { status, error: "Bad Request", message, timestamp }
 *  - the gateway:           403 { error: "Forbidden", message, status }   /   500 with NO message when the
 *                           protocol service is down (it does not translate that to 502/503)
 *  - nothing at all:        fetch rejects (network down) -> status 0
 */
export async function requestProtocol<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server");
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const code = typeof body?.error === "string" ? body.error : (body?.error?.code ?? "UNKNOWN");
    throw new ApiError(res.status, code, typeof body?.message === "string" ? body.message : res.statusText);
  }
  return body as T;
}
