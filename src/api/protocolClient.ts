import { getToken } from "../auth/keycloak";
import { ApiError } from "./client";

// cce-protocol-service is called THROUGH THE GATEWAY with the user's own token — there is no admin-service
// endpoint in between (Milestone 8). In development the Vite dev server forwards /v1/protocol to the gateway.
const BASE_URL = `${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/protocol`;

/**
 * Three different things can answer here, with three different bodies, so the status decides and the body only
 * supplies wording:
 *  - the protocol service:  { status, error: "Bad Request", message, timestamp }
 *  - the gateway:           403 { error: "Forbidden", message, status }  (no permission row)  /  an EMPTY 403
 *                           (CORS: this console's origin isn't in the gateway's ALLOWED_ORIGINS; browsers send
 *                           Origin on every POST, so upload and retire fail while GETs still work)  /  500 with NO message when the
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
    // NO_BODY matters: the gateway's permission 403 has a JSON body, but its CORS refusal (the console's origin is
    // not in ALLOWED_ORIGINS) is an EMPTY 403 — and the two need different advice.
    const code = typeof body?.error === "string" ? body.error : (body?.error?.code ?? (body === null ? "NO_BODY" : "UNKNOWN"));
    throw new ApiError(res.status, code, typeof body?.message === "string" ? body.message : res.statusText);
  }
  return body as T;
}
