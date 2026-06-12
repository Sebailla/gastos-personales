/**
 * Argon2id wrapper. Final parameters (BR-AUTH-3) tuned for
 * 50–100 ms on a Fly.io 1-CPU VM:
 *
 *   memoryCost: 19 MiB (19456 KiB)
 *   timeCost:   2
 *   parallelism: 1
 *
 * The library is `@node-rs/argon2` (prebuilt NAPI binaries,
 * no `node-gyp` at install time). The benchmark script
 * `scripts/bench-argon2.ts` re-runs the chosen parameters
 * against the target VM and reports a `BAND_OK` / `BAND_SLOW`
 * / `BAND_FAST` verdict; the `argon2.parameters.test.ts`
 * security test in Slice C re-validates the band in CI.
 *
 * Implements the `PasswordHasherPort` interface from the
 * domain layer.
 */

import { hash, verify, Algorithm } from '@node-rs/argon2';
import type { PasswordHasherPort } from '../../domain/interfaces/password-hasher.port';

export const ARGON2ID_PARAMS = {
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2idHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, {
      algorithm: Algorithm.Argon2id,
      memoryCost: ARGON2ID_PARAMS.memoryCost,
      timeCost: ARGON2ID_PARAMS.timeCost,
      parallelism: ARGON2ID_PARAMS.parallelism,
    });
  }

  async verify(hashStr: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(hashStr, plaintext);
    } catch {
      // A malformed hash is a "no match", not an exception.
      return false;
    }
  }
}

// Backward-compatible function exports for the Auth.js
// `authorize()` function in `authjs.ts` (which lives in the
// same layer and is allowed to import the concrete hasher).
export async function hashArgon2id(plaintext: string): Promise<string> {
  return new Argon2idHasher().hash(plaintext);
}

export async function verifyArgon2id(hashStr: string, plaintext: string): Promise<boolean> {
  return new Argon2idHasher().verify(hashStr, plaintext);
}
