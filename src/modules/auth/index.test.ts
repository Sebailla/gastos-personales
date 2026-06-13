import { describe, it, expect } from 'vitest';
import * as authModule from './index';

describe('auth module public API', () => {
  it('exports the documented surface', () => {
    expect(typeof authModule.auth).toBe('function');
    expect(typeof authModule.signIn).toBe('function');
    expect(typeof authModule.signOut).toBe('function');
    expect(authModule.handlers).toBeDefined();
    expect(typeof authModule.handlers.GET).toBe('function');
    expect(typeof authModule.handlers.POST).toBe('function');
    expect(authModule.UserRegistered).toBe('UserRegistered');
    expect(authModule.UserSignedIn).toBe('UserSignedIn');
  });
});
