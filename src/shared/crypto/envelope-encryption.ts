/**
 * Envelope encryption for OAuth tokens at rest (4R-R1 CRITICAL-3).
 *
 * Why this exists: the Prisma `Account` model stores
 * `refresh_token`, `access_token`, and `id_token` as plaintext
 * (`String? @db.Text`). A database read (DBA, backup leak, replica
 * compromise, SQL injection) yields full Google account takeover
 * for every linked user. The OWASP A02 (Cryptographic Failures) fix
 * is to encrypt the tokens at the application boundary so the DB
 * stores only opaque ciphertext.
 *
 * Algorithm: AES-256-GCM with a per-row random 12-byte IV. The
 * key is a 32-byte secret read from `OAUTH_TOKEN_ENCRYPTION_KEY`
 * (env var, hex-encoded 64 chars). The output layout is:
 *
 *   [ 12-byte IV | N-byte ciphertext | 16-byte GCM tag ]
 *
 * The IV is the first 12 bytes of the buffer; the tag is the
 * last 16 bytes. GCM is authenticated, so a tampered ciphertext
 * fails decryption with a `DataError` (caught and re-thrown as
 * an `AppError` at the call site).
 *
 * Threat model:
 *   - DB read without app process: yields ciphertext. The IV +
 *     tag are useless without the key, which lives in the
 *     process env (Fly secrets store).
 *   - DB read WITH app process (compromised runtime): the
 *     attacker can decrypt. This is the standard envelope
 *     encryption trade-off; full mitigation requires KMS or HSM.
 *   - Key rotation: out of scope for this iteration. A
 *     future change should support multiple key versions in
 *     the envelope (key id + ciphertext + tag).
 *
 * Sync vs async: `crypto.subtle.encrypt` / `decrypt` are async.
 * The call sites in the adapter wrapper are async too (the
 * Auth.js v5 `Adapter` interface is async), so no perf cost.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

const ALGORITHM = 'AES-GCM';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_HEX_CHARS = KEY_BYTES * 2; // 64

const enc = new TextEncoder();
const dec = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'OAUTH_TOKEN_ENCRYPTION_KEY hex length is not even.',
    });
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `OAUTH_TOKEN_ENCRYPTION_KEY contains non-hex character at position ${i * 2}.`,
      });
    }
    out[i] = byte;
  }
  return out;
}

async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKey, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

/**
 * Read and validate the encryption key from an env value.
 *
 * Format: 64 hex characters (32 raw bytes). Throws `AppError` on
 * missing or malformed input. The returned `Uint8Array` is the
 * raw key bytes (not a `CryptoKey`); callers pass it through
 * `importKey` at the encryption site to keep the imported
 * handle short-lived.
 */
export function loadEnvelopeKey(envValue: string | undefined): Uint8Array {
  if (!envValue) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message:
        'OAUTH_TOKEN_ENCRYPTION_KEY is required for OAuth token encryption. ' +
        'Set it to 64 hex characters (32 bytes). See docs/adr/0009-oauth-token-encryption.md.',
    });
  }
  const trimmed = envValue.trim();
  if (trimmed.length !== KEY_HEX_CHARS) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: `OAUTH_TOKEN_ENCRYPTION_KEY must be ${KEY_HEX_CHARS} hex characters (got ${trimmed.length}).`,
    });
  }
  return hexToBytes(trimmed);
}

/**
 * Encrypt a plaintext string with the given key bytes.
 *
 * Returns a `Uint8Array` of layout `[IV | ciphertext | tag]`,
 * suitable for storage in a `Bytes?` Prisma column.
 */
export async function encryptEnvelope(plaintext: string, key: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cryptoKey = await importKey(key);
  const data = enc.encode(plaintext);
  // Web Crypto appends the 16-byte tag to the ciphertext output.
  const ciphertextWithTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, cryptoKey, data),
  );
  const out = new Uint8Array(IV_BYTES + ciphertextWithTag.length);
  out.set(iv, 0);
  out.set(ciphertextWithTag, IV_BYTES);
  return out;
}

/**
 * Decrypt a buffer produced by `encryptEnvelope`.
 *
 * Throws `AppError` (cryptographic-failure category) on:
 *   - Buffer too short to contain IV + tag.
 *   - GCM authentication failure (wrong key or tampered ciphertext).
 *   - UTF-8 decode failure of the recovered plaintext.
 */
export async function decryptEnvelope(ciphertext: Uint8Array, key: Uint8Array): Promise<string> {
  if (ciphertext.length < IV_BYTES + TAG_BYTES) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Encrypted token is too short to contain IV + tag.',
    });
  }
  const iv = ciphertext.slice(0, IV_BYTES);
  const body = ciphertext.slice(IV_BYTES);
  const cryptoKey = await importKey(key);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, cryptoKey, body);
    return dec.decode(plaintext);
  } catch {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'OAuth token decryption failed (wrong key or tampered ciphertext).',
    });
  }
}
