import { z } from "zod";

// Same rule the server enforces (CreateRoleRequest): UPPER_SNAKE_CASE, single underscores between
// words, starts with a letter. The server stays the authority — see the 409 handling in the form.
export const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters")
    .regex(ROLE_NAME_PATTERN, "Use UPPER_SNAKE_CASE, e.g. FACILITY_ADMIN"),
  displayName: z.string().trim().min(1, "Display name is required").max(150, "At most 150 characters"),
  description: z.string().optional(),
});

export type CreateRoleForm = z.infer<typeof createRoleSchema>;
