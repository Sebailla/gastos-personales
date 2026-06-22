import { describe, it, expect } from 'vitest';
import { envSchema } from './env.schema';

describe('envSchema additions for fx-cache', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/gastos_test',
    AUTH_SECRET: 'ci-only-secret-32-bytes-min-padding',
    AUTH_URL: 'http://localhost:3000',
    APP_URL: 'http://localhost:3000',
    AUTH_GOOGLE_ID: 'ci-google-id',
    AUTH_GOOGLE_SECRET: 'ci-google-secret',
    ARGON2ID_DUMMY_PASSWORD: 'ci-dummy-password-32-bytes-min-padding',
  };

  it('parses a valid DOLAR_API_BASE_URL', () => {
    const parsed = envSchema.parse({ ...baseEnv, DOLAR_API_BASE_URL: 'http://localhost:9999' });
    expect(parsed.DOLAR_API_BASE_URL).toBe('http://localhost:9999');
  });

  it('DOLAR_API_BASE_URL is optional (omitted -> other tests still pass)', () => {
    const parsed = envSchema.parse(baseEnv);
    expect(parsed.DOLAR_API_BASE_URL).toBeUndefined();
  });

  it('FX_DEFAULT_CASA=oficial parses through the lowercase Zod schema', () => {
    const parsed = envSchema.parse({ ...baseEnv, FX_DEFAULT_CASA: 'oficial' });
    expect(parsed.FX_DEFAULT_CASA).toBe('oficial');
  });

  it('FX_DEFAULT_CASA=OfiCial fails', () => {
    expect(() => envSchema.parse({ ...baseEnv, FX_DEFAULT_CASA: 'OfiCial' })).toThrow();
  });

  it('FX_DEFAULT_CASA=BLUE fails', () => {
    expect(() => envSchema.parse({ ...baseEnv, FX_DEFAULT_CASA: 'BLUE' })).toThrow();
  });

  it('FX_DEFAULT_CASA unset -> action-layer resolution defaults to oficial (casa enum is the source of truth)', () => {
    // The env schema does NOT default FX_DEFAULT_CASA; the
    // action layer applies the default ('oficial') at the
    // resolution point. This test asserts the schema treats
    // the key as optional.
    const parsed = envSchema.parse(baseEnv);
    expect(parsed.FX_DEFAULT_CASA).toBeUndefined();
  });
});