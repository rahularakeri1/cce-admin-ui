import { z } from "zod";

// Mirrors the server's CreateUserRequest; the server stays the authority (and lower-cases both
// username and email itself, as Keycloak does).
export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(100, "At most 100 characters")
    .regex(/^[A-Za-z0-9._@+-]+$/, "Letters, digits and . _ @ + - only"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(255),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  facilityScope: z.string().trim().max(255).optional(),
});

export type CreateUserForm = z.infer<typeof createUserSchema>;
