/**
 * healthAction — application-layer entry point for
 * `GET /api/health`. The action is public (no auth, no
 * session).
 *
 * The version is read from `package.json` at module init
 * (no per-request file I/O). The uptime is
 * `process.uptime()` at request time.
 *
 * Per the `logging-monitoring` skill, the health check is
 * the primary signal that the deploy is live. The body is
 * small and stable so dashboards can parse it.
 */

import pkg from '../../../../../package.json' with { type: 'json' };
import type { HealthSuccess } from '../dto/health.dto';

export type HealthActionResult = { status: 200; data: HealthSuccess };

const APP_VERSION: string = pkg.version;

export async function healthAction(): Promise<HealthActionResult> {
  return {
    status: 200,
    data: {
      status: 'ok',
      version: APP_VERSION,
      uptime: process.uptime(),
    },
  };
}
