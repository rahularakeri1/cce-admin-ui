import { z } from "zod";
import { HTTP_METHODS } from "../api/roles";

// Mirrors the server's PermissionInput validation; the server stays the authority.
export const permissionRowSchema = z.object({
  httpMethod: z.enum(HTTP_METHODS),
  uriPattern: z
    .string()
    .trim()
    .min(1, "URI pattern is required")
    .max(512, "At most 512 characters")
    .regex(/^\/\S*$/, "Must start with / and contain no spaces"),
  description: z.string().nullable().optional(),
  category: z.string().max(255, "At most 255 characters").nullable().optional(),
});

export const permissionSetSchema = z.array(permissionRowSchema).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${row.httpMethod} ${row.uriPattern.trim()}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "uriPattern"],
        message: "Duplicate of an earlier row (same method and pattern)",
      });
    }
    seen.add(key);
  });
});

/** Row index -> first message, for inline display next to the offending row. */
export function validatePermissionRows(rows: unknown[]): Record<number, string> {
  const result = permissionSetSchema.safeParse(rows);
  if (result.success) return {};
  const errors: Record<number, string> = {};
  for (const issue of result.error.issues) {
    const index = issue.path[0];
    if (typeof index === "number" && !(index in errors)) errors[index] = issue.message;
  }
  return errors;
}
