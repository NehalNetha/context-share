import { describe, expect, it } from "vitest";
import { extractBullets, extractCommands, extractFiles, inferGoal, inferTitle } from "../src/core/extract.js";

describe("extractFiles", () => {
  it("finds file paths with extensions", () => {
    const files = extractFiles("edit src/core/store.ts and check lib/utils/text.js:42");
    expect(files).toContain("src/core/store.ts");
    expect(files).toContain("lib/utils/text.js:42");
  });

  it("deduplicates", () => {
    const files = extractFiles("src/a.ts src/a.ts src/a.ts");
    expect(files).toEqual(["src/a.ts"]);
  });
});

describe("extractCommands", () => {
  it("finds inline commands", () => {
    const commands = extractCommands("run `npm test` then `git push`");
    expect(commands).toEqual(["npm test", "git push"]);
  });

  it("finds fenced shell blocks", () => {
    const commands = extractCommands("```bash\nnpm install\nnpm run build\n```");
    expect(commands).toEqual(["npm install", "npm run build"]);
  });
});

describe("extractBullets", () => {
  it("picks lines matching keywords", () => {
    const bullets = extractBullets("- TODO: fix parser\n- unrelated line\n- decision: use zod", ["todo"]);
    expect(bullets).toEqual(["TODO: fix parser"]);
  });
});

describe("inferTitle / inferGoal", () => {
  const messages = [
    { role: "assistant" as const, text: "Hello!" },
    { role: "user" as const, text: "Please refactor the auth module" }
  ];

  it("uses the first user message", () => {
    expect(inferTitle(messages, "fallback")).toBe("Please refactor the auth module");
    expect(inferGoal(messages, "fallback")).toBe("Please refactor the auth module");
  });

  it("falls back when there is no user message", () => {
    expect(inferTitle([], "fallback")).toBe("fallback");
  });
});
