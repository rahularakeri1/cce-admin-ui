import { z } from "zod";

// Same rules the server enforces (MenuRequest): the key is lower-case, permanent and unique; the path starts with
// "/". The server stays the authority — see the 409 handling in the form.
export const MENU_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export const menuFormSchema = z.object({
  menuKey: z
    .string()
    .min(1, "Key is required")
    .max(100, "Key must be at most 100 characters")
    .regex(MENU_KEY_PATTERN, "Use lower-case letters, digits, - or _, e.g. reports"),
  label: z.string().trim().min(1, "Label is required").max(150, "At most 150 characters"),
  path: z
    .string()
    .trim()
    .min(1, "Path is required")
    .max(255, "At most 255 characters")
    .regex(/^\//, "Path must start with /"),
  icon: z.string().trim().max(100, "At most 100 characters").optional(),
  sortOrder: z
    .number({ invalid_type_error: "Sort order must be a number" })
    .int("Use a whole number")
    .min(0, "Zero or more"),
  isActive: z.boolean(),
});

export type MenuForm = z.infer<typeof menuFormSchema>;
