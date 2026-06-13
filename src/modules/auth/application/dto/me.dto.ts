/**
 * Me DTO — the response shape for `GET /api/me`.
 *
 * This is a structural mirror of the domain `PublicUserShape`
 * for compile-time type-safety. The Hono route in
 * `src/modules/api/app.ts` returns the domain projection
 * directly (already a `PublicUserShape`); the schema here is
 * for the openapi doc generation and for the typed client
 * compile-time check.
 */

import { z } from 'zod';

export const meSuccessSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  defaultProvider: z.enum(['local', 'google']),
  lastLoginAt: z.string().nullable(),
});

export type MeSuccess = z.infer<typeof meSuccessSchema>;
