import { describe, it, expect } from "vitest";
import { encryptFernet, decryptFernet, decryptFernetHealth } from "./fernet";

const SECRET = "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa";
// Printed by Task 1 Step 1's ground-truth script against backend/.venv's cryptography.fernet.Fernet.
const PYTHON_TOKEN =
  "gAAAAABqdvR0ZJQqwH2nObUhdMF1Zsq0o3gGq8CqxvZ2wS0DIW3LXlpEUZR3wUyCYG54dS80ougv1ROJ3-9VnSrPLuvfkDCLFQ==";

// Short secret (11 bytes < 32) so raw.ljust(32)[:32] actually pads — this is
// the vector that discriminates the pad byte (0x20 vs 0x00). Generated the
// same way as PYTHON_TOKEN above, with secret = "shortsecret".
const SHORT_SECRET = "shortsecret";
const SHORT_SECRET_TOKEN =
  "gAAAAABqdvVkD47W9oIhrdTJYoqkKa3D5j-uauu6BIFZGa42qVF9gGzEoyWcLYs0lCYgOKQYBZh5IAON2wUk8pJs8y7iRRVVvg==";

describe("fernet", () => {
  it("round-trips a value through Node's own encrypt/decrypt", () => {
    const token = encryptFernet("hello world", SECRET);
    expect(decryptFernet(token, SECRET)).toBe("hello world");
  });

  it("decrypts a token produced by Python's cryptography.fernet.Fernet", () => {
    expect(decryptFernet(PYTHON_TOKEN, SECRET)).toBe("test-value-123");
  });

  it("decrypts a Python token whose key derivation exercised the pad byte (secret < 32 bytes)", () => {
    expect(decryptFernet(SHORT_SECRET_TOKEN, SHORT_SECRET)).toBe("pad-check");
  });

  it("returns empty string (not throw) on a corrupt token", () => {
    expect(decryptFernet("not-a-valid-token", SECRET)).toBe("");
  });

  it("decryptFernetHealth reports ok/corrupted without throwing", () => {
    const token = encryptFernet("x", SECRET);
    expect(decryptFernetHealth(token, SECRET)).toBe("ok");
    expect(decryptFernetHealth("garbage", SECRET)).toBe("corrupted");
  });
});
