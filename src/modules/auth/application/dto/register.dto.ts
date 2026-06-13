/**
 * Register DTO (application layer boundary).
 *
 * The Zod schema is the single source of truth for the
 * `POST /api/auth/register` request body. The action calls
 * `registerInputSchema.safeParse(input)`; on success the
 * action delegates to `AuthService.register`; on failure the
 * action returns the typed error envelope.
 *
 * Per BR-AUTH-2, the password minimum is 10 characters.
 * The email is normalized (trimmed + lowercased) at the
 * boundary so the application code never has to defend
 * against whitespace or case in the input.
 */

import { z } from 'zod';

export const registerInputSchema = z.object({
  email: z
    .string({ required_error: 'email is required', invalid_type_error: 'email must be a string' })
    .trim()
    .min(1, 'email must not be empty')
    .max(254, 'email too long')
    .email('invalid email format')
    .transform((s) => s.toLowerCase()),
  password: z
    .string({
      required_error: 'password is required',
      invalid_type_error: 'password must be a string',
    })
    .min(10, 'La contraseña debe tener al menos 10 caracteres.'),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
