import { describe, expect, it } from "vitest";
import { redactText } from "../src/core/redact.js";

describe("redactText", () => {
  it("redacts OpenAI-style keys", () => {
    const result = redactText("my key is sk-abcdefghijklmnopqrstuvwx123456");
    expect(result.text).toContain("[REDACTED_OPENAI_KEY]");
    expect(result.redactions).toEqual([{ kind: "openai-api-key", count: 1 }]);
  });

  it("redacts bearer tokens", () => {
    const result = redactText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.text).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("redacts private key blocks", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
    const result = redactText(input);
    expect(result.text).toBe("[REDACTED_PRIVATE_KEY]");
  });

  it("redacts secret assignments", () => {
    const result = redactText("api_key = supersecretvalue123");
    expect(result.text).toContain("[REDACTED_SECRET_ASSIGNMENT]");
  });

  it("keeps uuid-like identifiers", () => {
    const uuidish = "0a1b2c3d-4e5f-6789-abcd-ef0123456789-0a1b2c3d-4e5f";
    const result = redactText(uuidish);
    expect(result.text).toBe(uuidish);
  });

  it("leaves ordinary prose untouched", () => {
    const input = "Refactor the parser and run npm test before shipping.";
    const result = redactText(input);
    expect(result.text).toBe(input);
    expect(result.redactions).toEqual([]);
  });
});
