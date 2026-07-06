import { describe, expect, it } from "vitest";
import { renderInjectionPrompt, renderMarkdown } from "../src/core/render.js";
import type { PortableContext } from "../src/core/schema.js";

const context: PortableContext = {
  id: "codex-test",
  source: "codex",
  title: "Fix the login bug",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  workspace: "/tmp/project",
  goal: "Fix the login bug",
  summary: "We are fixing a login bug.",
  messages: [
    ...Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `Message ${i}`
    })),
    { role: "tool" as const, text: "Tool use: Bash — npm test" }
  ],
  filesMentioned: ["src/auth.ts"],
  commands: ["npm test"],
  decisions: ["decided to use JWT"],
  openTasks: ["TODO: add tests"],
  redactions: [{ kind: "bearer-token", count: 2 }],
  rawRefs: ["/tmp/session.jsonl"]
};

describe("renderMarkdown", () => {
  it("includes headline metadata and sections", () => {
    const md = renderMarkdown(context);
    expect(md).toContain("# Fix the login bug");
    expect(md).toContain("Workspace: /tmp/project");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Redactions");
  });

  it("compact mode keeps only recent messages, full mode keeps all", () => {
    const compact = renderMarkdown(context, "compact");
    const full = renderMarkdown(context, "full");
    expect(compact).not.toContain("Message 0");
    expect(compact).toContain("Message 11");
    expect(full).toContain("Message 0");
    expect(full).toContain("## Full Conversation");
  });
});

describe("renderInjectionPrompt", () => {
  it("produces a handoff prompt with context sections", () => {
    const prompt = renderInjectionPrompt(context);
    expect(prompt).toContain("You are continuing work from an exported AI coding session.");
    expect(prompt).toContain("Workspace: /tmp/project");
    expect(prompt).toContain("- decided to use JWT");
    expect(prompt).toContain("Continue from this context and ask only if required.");
  });

  it("defaults to the last 8 messages", () => {
    const prompt = renderInjectionPrompt(context);
    expect(prompt).not.toContain("Message 4");
    expect(prompt).toContain("Message 5");
  });

  it("honors a custom message count", () => {
    const prompt = renderInjectionPrompt(context, { messageCount: 2 });
    expect(prompt).not.toContain("Message 10");
    expect(prompt).toContain("Message 11");
    expect(prompt).toContain("Tool use: Bash");

    const all = renderInjectionPrompt(context, { messageCount: 100 });
    expect(all).toContain("Message 0");
  });

  it("excludes tool messages when includeTools is false", () => {
    const prompt = renderInjectionPrompt(context, { includeTools: false });
    expect(prompt).not.toContain("Tool use: Bash");
    expect(prompt).toContain("Message 11");

    const full = renderMarkdown(context, "full", { includeTools: false });
    expect(full).not.toContain("Tool use: Bash");
    expect(full).toContain("Message 0");
  });

  it("excludes the files list when includeFiles is false", () => {
    const prompt = renderInjectionPrompt(context, { includeFiles: false });
    expect(prompt).not.toContain("Relevant files:");
    expect(prompt).not.toContain("src/auth.ts");

    const full = renderMarkdown(context, "full", { includeFiles: false });
    expect(full).not.toContain("## Relevant Files");
  });
});
