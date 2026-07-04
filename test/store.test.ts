import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PortableContext } from "../src/core/schema.js";
import { deleteContext, loadContext, readIndex, resolveEntry, saveContext } from "../src/core/store.js";

function makeContext(id: string): PortableContext {
  return {
    id,
    source: "codex",
    title: `Context ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    summary: "A test context.",
    messages: [{ role: "user", text: "hello" }],
    filesMentioned: [],
    commands: [],
    decisions: [],
    openTasks: [],
    redactions: [],
    rawRefs: []
  };
}

describe("store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-store-test-"));
    process.env.CTX_STORE_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.CTX_STORE_DIR;
    await fs.remove(tempDir);
  });

  it("saves and loads a context", async () => {
    await saveContext(makeContext("codex-aaa111"));
    const loaded = await loadContext("codex-aaa111");
    expect(loaded.title).toBe("Context codex-aaa111");
    expect(await fs.pathExists(path.join(tempDir, "sessions", "codex-aaa111.md"))).toBe(true);
  });

  it("resolves 'last' to the most recently saved context", async () => {
    await saveContext(makeContext("codex-aaa111"));
    await saveContext(makeContext("codex-bbb222"));
    const entry = await resolveEntry("last");
    expect(entry.id).toBe("codex-bbb222");
  });

  it("resolves unique prefixes and rejects ambiguous ones", async () => {
    await saveContext(makeContext("codex-aaa111"));
    await saveContext(makeContext("codex-abb222"));
    const entry = await resolveEntry("codex-aa");
    expect(entry.id).toBe("codex-aaa111");
    await expect(resolveEntry("codex-a")).rejects.toThrow(/ambiguous/);
  });

  it("deletes contexts and their files", async () => {
    await saveContext(makeContext("codex-aaa111"));
    await deleteContext("codex-aaa111");
    const index = await readIndex();
    expect(index.sessions).toHaveLength(0);
    expect(await fs.pathExists(path.join(tempDir, "sessions", "codex-aaa111.json"))).toBe(false);
  });
});
