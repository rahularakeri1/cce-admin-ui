import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { classifyProtocolError } from "./protocolErrors";

const err = (status: number, message = "msg") => new ApiError(status, "X", message);

describe("classifyProtocolError — the status decides, the body only supplies wording", () => {
  it("403 (the gateway has no permission row for this role) -> forbidden", () => {
    expect(classifyProtocolError(err(403), "upload")).toEqual({ kind: "forbidden", message: "Your role isn't allowed to do this." });
  });

  it("any 5xx and a network failure (status 0) -> unavailable, and says whether anything changed", () => {
    for (const status of [500, 502, 503, 504, 0]) {
      expect(classifyProtocolError(err(status), "load").kind).toBe("unavailable");
    }
    expect(classifyProtocolError(err(500), "upload").message).toMatch(/Nothing was uploaded/);
    expect(classifyProtocolError(err(500), "retire").message).toMatch(/Nothing was changed/);
    expect(classifyProtocolError(err(500), "load").message).not.toMatch(/Nothing was/);
  });

  it("400 'already exists' (a duplicate url+version is a 400, not a 409) -> duplicate, with what to do", () => {
    const f = classifyProtocolError(err(400, "Protocol definition already exists for url=u, version=1"), "upload");
    expect(f.kind).toBe("duplicate");
    expect(f.message).toMatch(/already loaded.*change the version.*retire the old one/);
  });

  it("other 400 and 422 -> rejected, showing the protocol service's own reason", () => {
    expect(classifyProtocolError(err(422, "HAPI-1861: bad"), "upload")).toEqual({ kind: "rejected", message: "HAPI-1861: bad" });
    expect(classifyProtocolError(err(400, "planDefinitionJson must not be blank"), "upload").kind).toBe("rejected");
  });

  it("404 -> notFound, 409 -> alreadyRetired, 401 -> expired", () => {
    expect(classifyProtocolError(err(404), "load").kind).toBe("notFound");
    expect(classifyProtocolError(err(409), "retire").kind).toBe("alreadyRetired");
    expect(classifyProtocolError(err(401), "load").kind).toBe("expired");
  });

  it("anything that isn't an ApiError -> a generic message", () => {
    expect(classifyProtocolError(new Error("x"), "load").kind).toBe("unknown");
  });
});
