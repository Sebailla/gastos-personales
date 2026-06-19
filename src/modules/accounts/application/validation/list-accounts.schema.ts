/**
 * listAccountsSchema — Zod schema for the
 * `GET /api/accounts` query string.
 *
 * Per the spec, the smoke UI only ever passes
 * `?archivedAt=null` (BR-ACC-17) and a `limit`. The schema
 * is permissive: empty query is valid (defaults applied);
 * unknown keys are stripped; `limit` is clamped to 1..100.
 *
 * `cursor` is opaque (the next-page token from the previous
 * response). The schema treats it as an arbitrary string.
 */

import { z } from 'zod';

export const listAccountsSchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    archivedAt: z.enum(['null', 'live', 'archived']).optional(),
  })
  .strict();

export type ListAccountsQuery = z.infer<typeof listAccountsSchema>;
