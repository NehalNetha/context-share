import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { piSource } from "../src/sources/pi.js";
import type { PortableContext } from "../src/core/schema.js";

const entries = [
  { type: "session", version: 3, id: "abc-123", timestamp: "2026-06-07T11:52:29.244Z", cwd: "/tmp/project" },
  { type: "model_change", id: "m1", timestamp: "2026-06-07T11:52:29.247Z", provider: "google", modelId: "gemini" },
  {
    type: "message",
    id: "u1",
    timestamp: "2026-06-07T11:52:40.700Z",
    message: { role: "user", content: [{ type: "text", text: "Fix the parser bug" }] }
  },
  {
    type: "message",
    id: "a1",
    timestamp: "2026-06-07T11:52:47.670Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "On it." },
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls -F" } }
      ]
    }
  },
  {
    type: "message",
    id: "r1",
    timestamp: "2026-06-07T11:52:50.000Z",
    message: {
      role: "toolResult",
      content: [{ type: "toolResult", output: "src/ test/ package.json" }]
    }
  }
];

describe("pi parser", () => {
  let dir: string;
  let context: PortableContext;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-pi-test-"));
    const file = path.join(dir, "session.jsonl");
    await fs.writeFile(file, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
    context = await piSource.exportSession(file);
  });

  afterAll(async () => {
    await fs.remove(dir);
  });

  it("reads workspace and session id from the header", () => {
    expect(context.workspace).toBe("/tmp/project");
    expect(context.sourceRef?.sessionId).toBe("abc-123");
    expect(context.createdAt).toBe("2026-06-07T11:52:29.244Z");
  });

  it("keeps user and assistant text", () => {
    const roles = context.messages.map((message) => message.role);
    expect(roles).toEqual(["user", "assistant", "tool", "tool"]);
    expect(context.messages[0].text).toBe("Fix the parser bug");
  });

  it("keeps tool calls and results as tool messages", () => {
    const corpus = context.messages.map((message) => message.text).join("\n");
    expect(corpus).toContain('Tool use: bash — {"command":"ls -F"}');
    expect(corpus).toContain("src/ test/ package.json");
  });

  it("infers the title from the first user message", () => {
    expect(context.title).toBe("Fix the parser bug");
  });
});
