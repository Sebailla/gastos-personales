/**
 * Web Crypto helpers. Used for opaque session-token verification,
 * the request-id generator, and any other place we need
 * deterministic primitives. All functions are async because the
 * Web Crypto subtle API is async.
 *
 * - `uuidV7` generates a v7 uuid (time-ordered) for log
 *   correlation and primary keys where monotonicity helps.
 * - `sha256Hex` produces a deterministic hex digest.
 * - `hmacSign` / `hmacVerify` produce and verify an HMAC-SHA256
 *   signature.
 */

const enc = new TextEncoder();

export function uuidV7(): string {
  // 48-bit ms timestamp + 4-bit version + 12-bit rand + 2-bit variant + 62-bit rand.
  const ts = Date.now();
  const tsHex = ts.toString(16).padStart(12, '0');
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);
  // version 7 in the high nibble of byte 6
  rand[0] = (rand[0]! & 0x0f) | 0x70;
  // variant 10 in the high bits of byte 8
  rand[2] = (rand[2]! & 0x3f) | 0x80;
  const randHex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return (
    `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-${randHex.slice(0, 4)}-${randHex.slice(4, 8)}-${randHex.slice(8, 20)}`
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

export async function hmacVerify(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const key = await importHmacKey(secret);
  const sig = hexToBytes(signatureHex);
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(message));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
