import { describe, expect, it } from "vitest";
import { checkPlanDefinition } from "./planDefinition";

const valid = { resourceType: "PlanDefinition", url: "http://x/pd", version: "1.2.3", title: "T", action: [{}, {}] };
const check = (o: unknown) => checkPlanDefinition(typeof o === "string" ? o : JSON.stringify(o));
const error = (o: unknown) => {
  const r = check(o);
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

describe("checkPlanDefinition — the browser-side checks before anything is sent", () => {
  it("accepts a PlanDefinition and previews url, version, title and the number of actions", () => {
    expect(check(valid)).toEqual({ ok: true, preview: { url: "http://x/pd", version: "1.2.3", actionCount: 2, title: "T" } });
  });

  it("counts zero actions when there are none, and falls back to name when there is no title", () => {
    const r = check({ resourceType: "PlanDefinition", url: "u", version: "1", name: "N" });
    expect(r).toEqual({ ok: true, preview: { url: "u", version: "1", actionCount: 0, title: "N" } });
  });

  it("rejects text that is not JSON", () => {
    expect(error("{nope")).toMatch(/isn't valid JSON/);
    expect(error("")).toMatch(/isn't valid JSON/);
  });

  it("rejects JSON that is not a single object", () => {
    expect(error("[]")).toMatch(/single JSON object/);
    expect(error("null")).toMatch(/single JSON object/);
    expect(error('"text"')).toMatch(/single JSON object/);
  });

  it("recognises the curl request wrapper and says what to upload instead", () => {
    expect(error({ planDefinitionJson: "{}" })).toMatch(/request wrapper.*Upload the PlanDefinition itself/);
  });

  it("rejects another resourceType or a missing one, naming what it found", () => {
    expect(error({ ...valid, resourceType: "Bundle" })).toMatch(/"PlanDefinition".*"Bundle"/);
    const { resourceType: _omit, ...without } = valid;
    expect(error(without)).toMatch(/resourceType.*missing/);
  });

  it("rejects a missing, blank or non-string url or version", () => {
    expect(error({ ...valid, url: undefined })).toMatch(/no "url"/);
    expect(error({ ...valid, url: "   " })).toMatch(/no "url"/);
    expect(error({ ...valid, version: undefined })).toMatch(/no "version"/);
    expect(error({ ...valid, version: 3 })).toMatch(/no "version"/);
  });
});
