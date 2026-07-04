import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { assembleContext } from "../core/context.js";
import { UserError } from "../core/errors.js";
import type { PortableContext, PortableMessage } from "../core/schema.js";
import { safeJsonParse, stringValue } from "../core/text.js";
import type { ContextSource, SessionSummary } from "./types.js";

type CodexIndexEntry = {
  id: string;
  thread_name?: string;
  updated_at?: string;
};

type ParsedSessionFile = {
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  workspace?: string;
  messages: PortableMessage[];
};

const SESSION_ID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export const codexSource: ContextSource = {
  id: "codex",
  label: "Codex",
  aliases: ["codex"],

  async available(): Promise<boolean> {
    return fs.pathExists(codexRoot());
  },

  async listSessions(): Promise<SessionSummary[]> {
    const indexEntries = await readSessionIndex();
    const transcriptFiles = await findAllSessionFiles();
    const transcriptIds = new Set(
      transcriptFiles.map((file) => file.match(SESSION_ID_PATTERN)?.[1]).filter(Boolean)
    );

    return indexEntries
      .filter((entry) => transcriptIds.has(entry.id))
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      .map((entry) => ({
        ref: entry.id,
        title: entry.thread_name || "Codex session",
        updatedAt: entry.updated_at || ""
      }));
  },

  async exportSession(ref: string): Promise<PortableContext> {
    const indexEntries = await readSessionIndex();
    const indexEntry = indexEntries.find((entry) => entry.id === ref);
    const candidates = await findSessionFilesFor(ref);

    if (candidates.length === 0) {
      throw new UserError(`No Codex transcript file found for session ${ref}.`, `Looked in ${codexRoot()}.`);
    }

    const selected = candidates[0];
    const parsed = await parseSessionFile(selected);
    const now = new Date().toISOString();
    const title = indexEntry?.thread_name || parsed.title || "Codex session";
    const updatedAt = indexEntry?.updated_at || parsed.updatedAt || now;

    return assembleContext({
      source: "codex",
      sourceLabel: "Codex",
      title,
      createdAt: parsed.createdAt || updatedAt,
      updatedAt,
      workspace: parsed.workspace || inferWorkspaceFromMessages(parsed.messages),
      messages: parsed.messages,
      rawRefs: [selected],
      sourceRef: { kind: "codex", path: selected, sessionId: ref }
    });
  },

  async exportLatest(): Promise<PortableContext> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new UserError("No exportable Codex sessions found.", `Looked in ${codexRoot()}.`);
    }
    return this.exportSession(sessions[0].ref);
  }
};

function codexRoot(): string {
  return path.join(os.homedir(), ".codex");
}

async function readSessionIndex(): Promise<CodexIndexEntry[]> {
  const indexPath = path.join(codexRoot(), "session_index.jsonl");
  if (!(await fs.pathExists(indexPath))) {
    return [];
  }
  const content = await fs.readFile(indexPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeJsonParse(line))
    .filter((entry): entry is CodexIndexEntry => Boolean(entry && stringValue(entry.id)));
}

async function findSessionFilesFor(sessionId: string): Promise<string[]> {
  const files = await findAllSessionFiles();
  const withStats = await Promise.all(
    files.map(async (file) => ({
      file,
      stat: await fs.stat(file).catch(() => undefined)
    }))
  );

  return withStats
    .filter((item): item is { file: string; stat: fs.Stats } => Boolean(item.stat))
    .sort((a, b) => {
      const aHasId = a.file.includes(sessionId) ? 1 : 0;
      const bHasId = b.file.includes(sessionId) ? 1 : 0;
      if (aHasId !== bHasId) {
        return bHasId - aHasId;
      }
      return b.stat.mtimeMs - a.stat.mtimeMs;
    })
    .map((item) => item.file);
}

async function findAllSessionFiles(): Promise<string[]> {
  return fg(["sessions/**/*.{json,jsonl}", "archived_sessions/**/*.{json,jsonl}", "rollout-*.jsonl"], {
    cwd: codexRoot(),
    absolute: true,
    onlyFiles: true,
    suppressErrors: true
  });
}

async function parseSessionFile(file: string): Promise<ParsedSessionFile> {
  const content = await fs.readFile(file, "utf8");
  return file.endsWith(".jsonl") ? parseJsonl(content) : parseJson(content);
}

function parseJson(content: string): ParsedSessionFile {
  const raw = safeJsonParse(content);
  if (!raw) {
    return { messages: [{ role: "unknown", text: content }] };
  }

  const session = typeof raw.session === "object" && raw.session ? (raw.session as Record<string, unknown>) : undefined;
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? (raw as unknown[]) : [];
  return {
    title: stringValue(raw.thread_name) || stringValue(raw.title),
    createdAt: stringValue(session?.timestamp) || stringValue(raw.created_at),
    updatedAt: stringValue(raw.updated_at) || stringValue(session?.timestamp),
    workspace: stringValue(raw.cwd) || stringValue(raw.workspace) || stringValue(session?.cwd),
    messages: items.flatMap(extractMessages)
  };
}

function parseJsonl(content: string): ParsedSessionFile {
  const messages: PortableMessage[] = [];
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let title: string | undefined;
  let workspace: string | undefined;

  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const entry = safeJsonParse(line);
    if (!entry) {
      continue;
    }
    const timestamp = stringValue(entry.timestamp) || stringValue(entry.created_at) || stringValue(entry.updated_at);
    createdAt ??= timestamp;
    updatedAt = timestamp || updatedAt;
    title ||= stringValue(entry.thread_name) || stringValue(entry.title);
    workspace ||= stringValue(entry.cwd) || stringValue(entry.workspace);
    messages.push(...extractMessages(entry));
  }

  return { title, createdAt, updatedAt, workspace, messages };
}

function extractMessages(raw: unknown): PortableMessage[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const entry = raw as Record<string, unknown>;
  const payload = typeof entry.payload === "object" && entry.payload ? (entry.payload as Record<string, unknown>) : entry;
  const role = normalizeRole(payload.role || entry.role || payload.type || entry.type);
  const timestamp = stringValue(entry.timestamp) || stringValue(payload.timestamp);
  const text = extractText(payload) || extractText(entry);

  if (!text.trim()) {
    return [];
  }

  return [{ role, text: text.trim(), timestamp }];
}

function extractText(raw: Record<string, unknown>): string {
  const direct = stringValue(raw.text) || stringValue(raw.output) || stringValue(raw.message);
  if (direct) {
    return direct;
  }

  if (typeof raw.content === "string") {
    return raw.content;
  }
  if (Array.isArray(raw.content)) {
    return raw.content.map(extractContentPart).filter(Boolean).join("\n");
  }
  if (typeof raw.arguments === "string") {
    return raw.arguments;
  }
  if (raw.type === "function_call" && typeof raw.name === "string") {
    return `Tool call: ${raw.name}`;
  }
  if (raw.type === "function_call_output" && typeof raw.output === "string") {
    return raw.output;
  }
  return "";
}

function extractContentPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  const record = part as Record<string, unknown>;
  return stringValue(record.text) || stringValue(record.content) || "";
}

function normalizeRole(value: unknown): PortableMessage["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  if (value === "function_call" || value === "function_call_output" || value === "command_execution") {
    return "tool";
  }
  return "unknown";
}

function inferWorkspaceFromMessages(messages: PortableMessage[]): string | undefined {
  const corpus = messages
    .slice(0, 20)
    .map((message) => message.text)
    .join("\n");
  return corpus.match(/<cwd>(.*?)<\/cwd>/)?.[1] || corpus.match(/<workspace_roots><root>(.*?)<\/root>/)?.[1];
}
