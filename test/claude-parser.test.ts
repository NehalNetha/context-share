import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claudeCodeSource } from "../src/sources/claude-code.js";

const entries = [
  {
    type: "user",
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: "/tmp/project",
    message: { role: "user", content: "Fix the login bug" }
  },
  {
    type: "assistant",
    timestamp: "2026-01-01T00:01:00.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Looking into it." },
        { type: "tool_use", name: "Bash", input: { command: "npm test" } }
      ]
    }
  },
  {
    type: "user",
    timestamp: "2026-01-01T00:02:00.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", content: [{ type: "text", text: "2 tests failed: auth.spec.ts" }] }]
    }
  },
  {
    type: "assistant",
    timestamp: "2026-01-01T00:03:00.000Z",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Edit",
          input: { file_path: "src/auth.ts", old_string: "return null", new_string: "return session.token" }
        },
        { type: "tool_use", name: "Read", input: { file_path: "src/session.ts" } }
      ]
    }
  }
];

describe("claude-code parser tool substance", () => {
  let dir: string;
  let corpus: string;
  let roles: string[];

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-claude-test-"));
    const file = path.join(dir, "session.jsonl");
    await fs.writeFile(file, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
    const context = await claudeCodeSource.exportSession(file);
    corpus = context.messages.map((message) => message.text).join("\n");
    roles = context.messages.map((message) => message.role);
  });

  afterAll(async () => {
    await fs.remove(dir);
  });

  it("keeps Bash commands", () => {
    expect(corpus).toContain("Tool use: Bash — npm test");
  });

  it("keeps Edit file path and new content", () => {
    expect(corpus).toContain("Tool use: Edit src/auth.ts");
    expect(corpus).toContain("return session.token");
  });

  it("keeps file paths for other file tools", () => {
    expect(corpus).toContain("Tool use: Read src/session.ts");
  });

  it("keeps tool result text from structured content", () => {
    expect(corpus).toContain("2 tests failed: auth.spec.ts");
  });

  it("marks tool activity with the tool role so it can be filtered", () => {
    // user text, assistant text, Bash use, tool result, Edit use, Read use
    expect(roles).toEqual(["user", "assistant", "tool", "tool", "tool", "tool"]);
  });
});
