/**
 * Structured logger with a denylist of keys that must never
 * appear in the output (BR-AUTH-11). Every line is JSON,
 * includes the requestId when present, and strips sensitive
 * material regardless of how deeply it is nested.
 *
 * The logger is intentionally small: pino-style structured
 * logs without a heavy dependency. Replace with `pino` or
 * `winston` if the project needs log shipping later.
 */

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

function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, payload: unknown) {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...(isPlainObject(payload) ? (payload as Record<string, unknown>) : { value: payload }),
  };
  const redacted = redact(line) as Record<string, unknown>;
  const stringified = JSON.stringify(redacted);
  // `console` is the only sink in this MVP. Wire a transport
  // (pino, winston, Datadog, etc.) at the deployment boundary.
  if (level === 'error') {
    console.error(stringified);
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
