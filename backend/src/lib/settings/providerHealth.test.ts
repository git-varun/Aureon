import { describe, expect, it } from "vitest";
import { enableRejectionMessage } from "./providerHealth";

// The enable-gate rejects a key-required provider whose live health check
// fails. The message must tell the operator whether to *add* a key or *fix*
// an existing one — the two failure modes for twelvedata (env key works) vs
// polygon (env key present but 401s) vs a never-configured provider.
describe("enableRejectionMessage", () => {
  it("says the key was rejected when a credential is present", () => {
    const msg = enableRejectionMessage("polygon", ["api_key"], true, "POLYGON_API_KEY");
    expect(msg).toContain("failed the live health check");
    expect(msg).toContain("rejected the credential");
    expect(msg).not.toContain("no API key is configured");
  });

  it("says no key is configured when none is present, naming the keys and env var", () => {
    const msg = enableRejectionMessage("polygon", ["api_key"], false, "POLYGON_API_KEY");
    expect(msg).toContain("no API key is configured");
    expect(msg).toContain("$POLYGON_API_KEY");
    expect(msg).toContain("Set api_key before enabling");
  });

  it("omits the env-var clause for providers with no env fallback (AI providers)", () => {
    const msg = enableRejectionMessage("groq", ["api_key"], false, undefined);
    expect(msg).toContain("no API key is configured (checked Settings)");
    expect(msg).not.toContain("$");
  });
});
