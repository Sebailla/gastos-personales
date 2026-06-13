/**
 * Health DTO — the response shape for `GET /api/health`.
 *
 * Per the `logging-monitoring` skill, a health check returns
 * `{ status, version, uptime }`. The version is read from
 * `package.json` at module init; `uptime` is `process.uptime()`
 * at request time.
 */

import { z } from 'zod';

export const healthSuccessSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number().nonnegative(),
});

export type HealthSuccess = z.infer<typeof healthSuccessSchema>;
