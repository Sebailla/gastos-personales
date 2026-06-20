/**
 * Tests for envelope encryption.
 *
 * The fixtures use a deterministic 32-byte key (all zeros) so the
 * test does not depend on `OAUTH_TOKEN_ENCRYPTION_KEY` being set in
 * the test env. Production code reads the key from env at boot.
 */

import { describe, it, expect } from 'vitest';
import {
  encryptEnvelope,
  decryptEnvelope,
  loadEnvelopeKey,
} from './envelope-encryption';

const TEST_KEY = new Uint8Array(32); // all zeros — deterministic for tests

describe('envelope-encryption', () => {
  describe('loadEnvelopeKey', () => {
    it('accepts a 64-char hex string and returns 32 bytes', () => {
      const hex = '0'.repeat(64);
      const key = loadEnvelopeKey(hex);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('rejects an undefined value', () => {
      expect(() => loadEnvelopeKey(undefined)).toThrow(/required/);
    });

    it('rejects the wrong hex length', () => {
      expect(() => loadEnvelopeKey('aa'.repeat(20))).toThrow(/64 hex characters/);
    });

    it('rejects a non-hex character', () => {
      const bad = 'z'.repeat(64);
      expect(() => loadEnvelopeKey(bad)).toThrow(/non-hex character/);
    });

    it('trims surrounding whitespace', () => {
      const hex = 'a'.repeat(64);
      const key = loadEnvelopeKey(`  ${hex}  `);
      expect(key.length).toBe(32);
    });
  });

  describe('encryptEnvelope / decryptEnvelope roundtrip', () => {
    it('recovers the original plaintext', async () => {
      const plaintext = 'ya29.a0AfH6SMBxx-y8Zk-...';
      const ciphertext = await encryptEnvelope(plaintext, TEST_KEY);
      const recovered = await decryptEnvelope(ciphertext, TEST_KEY);
      expect(recovered).toBe(plaintext);
    });

    it('produces a different ciphertext on each call (random IV)', async () => {
      const a = await encryptEnvelope('same input', TEST_KEY);
      const b = await encryptEnvelope('same input', TEST_KEY);
      expect(a).not.toEqual(b);
      // First 12 bytes are the IV — they must differ.
      expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
    });

    it('layout: [12-byte IV | ciphertext | 16-byte tag]', async () => {
      const plaintext = 'a'.repeat(64);
      const ciphertext = await encryptEnvelope(plaintext, TEST_KEY);
      // 12 (IV) + N (ciphertext == plaintext bytes for GCM-stream) + 16 (tag)
      expect(ciphertext.length).toBe(12 + plaintext.length + 16);
    });

    it('decrypts an empty string', async () => {
      const ciphertext = await encryptEnvelope('', TEST_KEY);
      expect(await decryptEnvelope(ciphertext, TEST_KEY)).toBe('');
    });

    it('decrypts a unicode string', async () => {
      const plaintext = 'contraseña ñ 中文 🔐';
      const ciphertext = await encryptEnvelope(plaintext, TEST_KEY);
      expect(await decryptEnvelope(ciphertext, TEST_KEY)).toBe(plaintext);
    });
  });

  describe('decryptEnvelope failure modes', () => {
    it('throws on a buffer too short to contain IV + tag', async () => {
      const tooShort = new Uint8Array(20); // < 12 + 16
      await expect(decryptEnvelope(tooShort, TEST_KEY)).rejects.toThrow(/too short/);
    });

    it('throws on a wrong key', async () => {
      const ciphertext = await encryptEnvelope('secret', TEST_KEY);
      const wrongKey = new Uint8Array(32);
      wrongKey[0] = 1; // any non-zero change
      await expect(decryptEnvelope(ciphertext, wrongKey)).rejects.toThrow(/decryption failed/);
    });

    it('throws on a tampered ciphertext (GCM auth failure)', async () => {
      const ciphertext = await encryptEnvelope('secret', TEST_KEY);
      const tampered = new Uint8Array(ciphertext);
      tampered[tampered.length - 1]! ^= 0x01; // flip a bit in the tag
      await expect(decryptEnvelope(tampered, TEST_KEY)).rejects.toThrow(/decryption failed/);
    });

    it('throws on a tampered IV (GCM auth failure)', async () => {
      const ciphertext = await encryptEnvelope('secret', TEST_KEY);
      const tampered = new Uint8Array(ciphertext);
      tampered[0]! ^= 0x01; // flip a bit in the IV
      await expect(decryptEnvelope(tampered, TEST_KEY)).rejects.toThrow(/decryption failed/);
    });
  });
});
