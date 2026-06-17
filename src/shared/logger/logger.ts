/**
 * Structured logger with a denylist of keys that must never
 * appear in the output (BR-AUTH-11). Every line is JSON,
 * includes the requestId when present, and strips sensitive
 * material regardless of how deeply it is nested.
 *
 * The logger is intentionally small: structured JSON without a
 * heavy dependency. Wire a transport (Sentry, Datadog, etc.)
 * at the deployment boundary by setting the corresponding env
 * var (e.g. `SENTRY_DSN`).
 *
 * When `SENTRY_DSN` is set (server runtime) or
 * `NEXT_PUBLIC_SENTRY_DSN` (client), error logs are also
 * forwarded to Sentry via `Sentry.captureException`. If Sentry
 * is not installed or not initialised, the logger continues to
 * work — only the remote forwarding is skipped.
 */

// Sentry is imported statically. The project depends on
// `@sentry/nextjs` (added in the Sentry wiring change). The
// static import keeps the module graph analyzable for bundlers
// and avoids dynamic-import timing pitfalls.
import * as Sentry from '@sentry/nextjs';

export const denylistKeys: readonly string[] = [
  'password',
  'passwordHash',
  'sessionToken',
  'access_token',
  'refresh_token',
  'id_token',
  'csrfToken',
  'set-cookie',
  'authorization',
  'cookie',
  'code',
];

const REDACTED = '[REDACTED]';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (denylistKeys.includes(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

/**
 * Forward an error to Sentry if a DSN is configured. The
 * redaction-safe payload (BR-AUTH-11) is attached as `extra`
 * so it is searchable in the Sentry UI but never sent in the
 * exception message itself.
 */
function forwardToSentry(message: string, payload: unknown): void {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  // `captureException` is a no-op until Sentry.init() runs (see
  // sentry.{server,client}.config.ts). If init never ran, the
  // call returns silently. This is intentional: the local
  // console sink must always work, with or without remote.
  Sentry.captureException(new Error(message), { extra: payload as Record<string, unknown> });
}

function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, payload: unknown) {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...(isPlainObject(payload) ? (payload as Record<string, unknown>) : { value: payload }),
  };
  const redacted = redact(line) as Record<string, unknown>;
  const stringified = JSON.stringify(redacted);
  // `console` is the local sink. Wire a transport (Sentry,
  // Datadog, etc.) at the deployment boundary by setting the
  // corresponding env var; `forwardToSentry` picks it up.
  if (level === 'error') {
    console.error(stringified);
    forwardToSentry(message, redacted);
  } else if (level === 'warn') {
    console.warn(stringified);
  } else if (level === 'debug') {
    console.debug(stringified);
  } else {
    console.info(stringified);
  }
}

export const logger = {
  debug: (message: string, payload?: unknown) => emit('debug', message, payload),
  info: (message: string, payload?: unknown) => emit('info', message, payload),
  warn: (message: string, payload?: unknown) => emit('warn', message, payload),
  error: (message: string, payload?: unknown) => emit('error', message, payload),
};
