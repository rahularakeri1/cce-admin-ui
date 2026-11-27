import { ApiError } from "../api/client";

export type ProtocolFailureKind =
  | "forbidden" // gateway 403: the role has no permission row for this call
  | "blocked" // an EMPTY 403: refused by the gateway's CORS check before any permission check
  | "unavailable" // protocol service down (gateway 500), any 5xx, or no network
  | "duplicate" // same (url, version) already loaded
  | "notFound"
  | "alreadyRetired"
  | "expired" // 401
  | "rejected" // the protocol service refused the content: its own reason is shown
  | "unknown";

export type ProtocolAction = "load" | "upload" | "retire";

export interface ProtocolFailure {
  kind: ProtocolFailureKind;
  message: string;
}

const NOTHING_CHANGED: Record<ProtocolAction, string> = {
  load: "",
  upload: " Nothing was uploaded.",
  retire: " Nothing was changed.",
};

/**
 * Turns whatever came back into one plain sentence. The status decides (see requestProtocol); the protocol
 * service's own message is used only where it IS the explanation (a rejected upload).
 */
export function classifyProtocolError(error: unknown, action: ProtocolAction): ProtocolFailure {
  if (!(error instanceof ApiError)) return { kind: "unknown", message: "Something went wrong — try again." };
  const { status, message } = error;

  if (status === 403 && error.code === "NO_BODY") {
    return {
      kind: "blocked",
      message:
        "The gateway blocked this request before it checked your role — this console's address is probably missing from the gateway's allowed origins. Tell an administrator.",
    };
  }
  if (status === 403) return { kind: "forbidden", message: "Your role isn't allowed to do this." };
  if (status === 401) return { kind: "expired", message: "Your session has expired — reload the page to sign in again." };
  if (status === 0 || status >= 500) {
    return { kind: "unavailable", message: `Protocol service unavailable — try again in a moment.${NOTHING_CHANGED[action]}` };
  }
  if (status === 404) return { kind: "notFound", message: "This protocol no longer exists." };
  if (status === 409) return { kind: "alreadyRetired", message: "This protocol is already retired." };
  if (status === 400 && /already exists/i.test(message)) {
    return {
      kind: "duplicate",
      message: "This version is already loaded — change the version in the file, or retire the old one.",
    };
  }
  if (status === 400 || status === 422) return { kind: "rejected", message };
  return { kind: "unknown", message: message || "Something went wrong — try again." };
}
