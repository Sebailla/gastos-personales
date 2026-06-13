import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Import only the schema factory; the env module re-evaluates
// process.env on import, so we test the schema in isolation.
import { envSchema } from './env.schema';

const baseEnv = {
  NODE_ENV: 'development' as const,
  PORT: '3000',
  LOG_LEVEL: 'info' as const,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/db',
  AUTH_SECRET: 'a'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:3000',
  AUTH_GOOGLE_ID: 'gid',
  AUTH_GOOGLE_SECRET: 'gsecret',
  ARGON2ID_DUMMY_PASSWORD: 'd'.repeat(32),
};

describe('envSchema', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a clean slate before each test.
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it.each([
    'DATABASE_URL',
    'AUTH_SECRET',
    'AUTH_GOOGLE_ID',
    'AUTH_GOOGLE_SECRET',
    'ARGON2ID_DUMMY_PASSWORD',
  ])('rejects a missing %s', (key) => {
    delete process.env[key];
    expect(() => envSchema.parse(process.env)).toThrow(z.ZodError);
  });

  it('rejects an AUTH_SECRET shorter than 32 bytes', () => {
    process.env.AUTH_SECRET = 'short';
    expect(() => envSchema.parse(process.env)).toThrow(/at least 32/i);
  });

  it('rejects an empty DATABASE_URL', () => {
    process.env.DATABASE_URL = '';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('rejects a malformed AUTH_URL', () => {
    process.env.AUTH_URL = 'not-a-url';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('coerces PORT to a positive integer', () => {
    process.env.PORT = '8080';
    const parsed = envSchema.parse(process.env);
    expect(parsed.PORT).toBe(8080);
    expect(typeof parsed.PORT).toBe('number');
  });

  it('rejects a NODE_ENV that is not part of the enum', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'staging',
      configurable: true,
      writable: true,
      enumerable: true,
    });
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('rejects a mismatch between AUTH_URL and APP_URL origins', () => {
    process.env.AUTH_URL = 'http://localhost:3000';
    process.env.APP_URL = 'https://gastos-personales.fly.dev';
    expect(() => envSchema.parse(process.env)).toThrow(/origin/i);
  });
});
