import { describe, it, expect } from 'vitest';
import { apiClient } from './client';

describe('apiClient (typed Hono client)', () => {
  it('is exported as a callable factory', () => {
    expect(typeof apiClient).toBe('function');
  });

  it('exposes the three typed routes: me, health, auth.register', () => {
    // The `hc` factory returns a client whose property
    // names match the Hono app's route paths. We assert
    // the surface exists at runtime; the inferred types
    // are checked at compile time.
    const client = apiClient('http://localhost:3000');
    expect(client).toBeDefined();
    expect(client.me).toBeDefined();
    expect(client.health).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.auth.register).toBeDefined();
    expect(typeof client.me.$get).toBe('function');
    expect(typeof client.health.$get).toBe('function');
    expect(typeof client.auth.register.$post).toBe('function');
  });
});
