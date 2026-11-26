export interface PlanDefinitionPreview {
  url: string;
  version: string;
  actionCount: number;
  title: string | null;
}

export type PlanDefinitionCheck = { ok: true; preview: PlanDefinitionPreview } | { ok: false; error: string };

/** Larger than any real protocol (the samples are ~14 KB); stops a wrong file from freezing the page. */
export const MAX_PROTOCOL_BYTES = 5 * 1024 * 1024;

/** Reads a picked file as text. FileReader rather than Blob.text(): it works in every browser we support. */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsText(file);
  });
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/**
 * The checks done IN THE BROWSER, before anything is sent: valid JSON, a PlanDefinition, url and version present.
 * Deliberately no deeper FHIR validation — the protocol service owns that and its reasons are shown inline.
 */
export function checkPlanDefinition(text: string): PlanDefinitionCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This isn't valid JSON — check for a missing comma, quote or bracket." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a single JSON object (a FHIR PlanDefinition)." };
  }
  const doc = parsed as Record<string, unknown>;

  if ("planDefinitionJson" in doc && !("resourceType" in doc)) {
    return {
      ok: false,
      error: 'This is the request wrapper ({ "planDefinitionJson": … }) used with curl. Upload the PlanDefinition itself.',
    };
  }
  if (doc.resourceType !== "PlanDefinition") {
    return {
      ok: false,
      error: `resourceType must be "PlanDefinition"${nonEmpty(doc.resourceType) ? `, but this file says "${doc.resourceType}"` : ", but it is missing"}.`,
    };
  }
  if (!nonEmpty(doc.url)) return { ok: false, error: 'The PlanDefinition has no "url" — it is what identifies the protocol.' };
  if (!nonEmpty(doc.version)) return { ok: false, error: 'The PlanDefinition has no "version" — each upload needs one.' };

  return {
    ok: true,
    preview: {
      url: doc.url,
      version: doc.version,
      actionCount: Array.isArray(doc.action) ? doc.action.length : 0,
      title: nonEmpty(doc.title) ? doc.title : nonEmpty(doc.name) ? doc.name : null,
    },
  };
}
