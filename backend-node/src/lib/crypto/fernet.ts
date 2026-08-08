import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Port of app/core/services/config.py's _fernet/_encrypt/_decrypt/_decrypt_health.
// Byte-compatible with Python's cryptography.fernet.Fernet — both backends
// read/write the same config.provider_configs.encrypted_keys column against
// the same SECRET_KEY. Do not add the `fernet` npm package: the format is
// small and fully specified (see plan Task 1), and a byte-for-byte port here
// is easier to verify against Python's real output than trusting a second
// implementation's compatibility claims.

function resolveSecret(secret?: string): string {
  const value = secret ?? process.env.SECRET_KEY;
  if (!value) throw new Error("SECRET_KEY is not set");
  return value;
}

function deriveKey(secret: string): { signingKey: Buffer; encryptionKey: Buffer } {
  const raw = Buffer.from(secret, "utf-8");
  // Matches Python's raw.ljust(32)[:32] — bytes.ljust's default fillchar is
  // 0x20 (space), NOT 0x00. Verified via backend/.venv: b'abc'.ljust(10) ==
  // b'abc       ' (hex 61626320202020202020) — see Task 1 Step 1 in the brief.
  const padded = Buffer.alloc(32, 0x20);
  raw.copy(padded, 0, 0, Math.min(raw.length, 32));
  const key = Buffer.from(padded.toString("base64url"), "base64url"); // 32 raw bytes, matches Fernet's key-after-b64-decode
  return { signingKey: key.subarray(0, 16), encryptionKey: key.subarray(16, 32) };
}

// Python's base64.urlsafe_b64encode keeps `=` padding, and urlsafe_b64decode
// rejects tokens whose length isn't a multiple of 4 — so encoding must emit
// padded base64url, not Node's unpadded "base64url" encoding, for tokens
// Node produces to be decryptable by Python.
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function encryptFernet(plaintext: string, secret?: string): string {
  const { signingKey, encryptionKey } = deriveKey(resolveSecret(secret));
  const iv = randomBytes(16);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const payload = Buffer.concat([Buffer.from([0x80]), timestamp, iv, ciphertext]);
  const hmac = createHmac("sha256", signingKey).update(payload).digest();
  return toBase64Url(Buffer.concat([payload, hmac]));
}

export function decryptFernet(token: string, secret?: string, context = ""): string {
  try {
    const { signingKey, encryptionKey } = deriveKey(resolveSecret(secret));
    const raw = fromBase64Url(token);
    if (raw.length < 1 + 8 + 16 + 32 || raw[0] !== 0x80) throw new Error("malformed token");
    const payload = raw.subarray(0, raw.length - 32);
    const hmac = raw.subarray(raw.length - 32);
    const expectedHmac = createHmac("sha256", signingKey).update(payload).digest();
    if (!timingSafeEqual(hmac, expectedHmac)) throw new Error("HMAC mismatch");
    const iv = payload.subarray(9, 25);
    const ciphertext = payload.subarray(25);
    const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf-8");
  } catch (e) {
    console.error(`Decryption failed [${context}] — ${(e as Error).message}`);
    return "";
  }
}

export function decryptFernetHealth(token: string, secret?: string): "ok" | "corrupted" {
  try {
    const { signingKey, encryptionKey } = deriveKey(resolveSecret(secret));
    const raw = fromBase64Url(token);
    if (raw.length < 1 + 8 + 16 + 32 || raw[0] !== 0x80) throw new Error("malformed token");
    const payload = raw.subarray(0, raw.length - 32);
    const hmac = raw.subarray(raw.length - 32);
    const expectedHmac = createHmac("sha256", signingKey).update(payload).digest();
    if (!timingSafeEqual(hmac, expectedHmac)) throw new Error("HMAC mismatch");
    const iv = payload.subarray(9, 25);
    const ciphertext = payload.subarray(25);
    const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
    Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return "ok";
  } catch {
    return "corrupted";
  }
}
