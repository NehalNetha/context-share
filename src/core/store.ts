import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { UserError } from "./errors.js";
import { renderMarkdown } from "./render.js";
import {
  type IndexEntry,
  type PortableContext,
  type StoreIndex,
  portableContextSchema,
  storeIndexSchema
} from "./schema.js";

/** Store location; override with CTX_STORE_DIR (useful for tests and scripting). */
export function storeRoot(): string {
  return process.env.CTX_STORE_DIR || path.join(os.homedir(), ".ctxstore");
}

function sessionsRoot(): string {
  return path.join(storeRoot(), "sessions");
}

function indexPath(): string {
  return path.join(storeRoot(), "index.json");
}

export async function saveContext(context: PortableContext): Promise<IndexEntry> {
  const parsed = portableContextSchema.parse(context);
  await fs.ensureDir(sessionsRoot());

  const jsonPath = path.join(sessionsRoot(), `${parsed.id}.json`);
  const markdownPath = path.join(sessionsRoot(), `${parsed.id}.md`);

  await fs.writeJson(jsonPath, parsed, { spaces: 2 });
  await fs.writeFile(markdownPath, renderMarkdown(parsed), "utf8");

  const entry: IndexEntry = {
    id: parsed.id,
    source: parsed.source,
    title: parsed.title,
    updatedAt: parsed.updatedAt,
    summary: parsed.summary,
    jsonPath,
    markdownPath
  };

  const index = await readIndex();
  const sessions = [entry, ...index.sessions.filter((item) => item.id !== parsed.id)];
  await writeIndex({ sessions });

  return entry;
}

export async function readIndex(): Promise<StoreIndex> {
  if (!(await fs.pathExists(indexPath()))) {
    return { sessions: [] };
  }
  const raw = await fs.readJson(indexPath());
  return storeIndexSchema.parse(raw);
}

export async function loadContext(idOrLast: string): Promise<PortableContext> {
  const entry = await resolveEntry(idOrLast);
  const raw = await fs.readJson(entry.jsonPath);
  return portableContextSchema.parse(raw);
}

export async function readMarkdown(idOrLast: string): Promise<string> {
  const entry = await resolveEntry(idOrLast);
  return fs.readFile(entry.markdownPath, "utf8");
}

export async function deleteContext(idOrLast: string): Promise<IndexEntry> {
  const entry = await resolveEntry(idOrLast);
  await fs.remove(entry.jsonPath);
  await fs.remove(entry.markdownPath);
  const index = await readIndex();
  await writeIndex({ sessions: index.sessions.filter((item) => item.id !== entry.id) });
  return entry;
}

export async function resolveEntry(idOrLast: string): Promise<IndexEntry> {
  const index = await readIndex();
  if (index.sessions.length === 0) {
    throw new UserError(
      `No saved contexts found in ${storeRoot()}.`,
      "Run `ctx export codex --last` or `ctx export claude --last` first."
    );
  }

  if (idOrLast === "last") {
    return index.sessions[0];
  }

  const exact = index.sessions.find((entry) => entry.id === idOrLast);
  if (exact) {
    return exact;
  }

  const prefixMatches = index.sessions.filter((entry) => entry.id.startsWith(idOrLast));
  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }
  if (prefixMatches.length > 1) {
    throw new UserError(
      `Context prefix "${idOrLast}" is ambiguous (${prefixMatches.length} matches).`,
      "Run `ctx list` and use a longer prefix."
    );
  }

  throw new UserError(`Context "${idOrLast}" not found.`, "Run `ctx list` to see saved contexts.");
}

async function writeIndex(index: StoreIndex): Promise<void> {
  await fs.ensureDir(storeRoot());
  await fs.writeJson(indexPath(), storeIndexSchema.parse(index), { spaces: 2 });
}
