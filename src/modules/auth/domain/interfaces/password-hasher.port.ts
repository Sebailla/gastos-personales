/**
 * Port interface: PasswordHasher. The auth domain's only
 * path to hash and verify passwords. The application code
 * does not import the concrete Argon2id implementation;
 * the port is implemented in the infrastructure layer
 * (`argon2.hasher.ts`) and injected into `AuthService`.
 *
 * This keeps the domain free of any infrastructure
 * dependency and makes the hasher swappable (e.g. for a
 * future hardware-backed KDF or a test fake).
 */

export interface PasswordHasherPort {
  hash(plaintext: string): Promise<string>;
  verify(hashStr: string, plaintext: string): Promise<boolean>;
}
