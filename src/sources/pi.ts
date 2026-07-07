import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { assembleContext } from "../core/context.js";
import { UserError } from "../core/errors.js";
import { inferTitle } from "../core/extract.js";
import type { PortableContext, PortableMessage } from "../core/schema.js";
import { safeJsonParse, stringValue, truncate } from "../core/text.js";
import type { ContextSource, SessionSummary } from "./types.js";

type ParsedPiSession = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  workspace?: string;
  messages: PortableMessage[];
};

const TOOL_INPUT_PREVIEW = 300;
const TOOL_RESULT_PREVIEW = 1500;
const MAX_LISTED_SESSIONS = 100;

export const piSource: ContextSource = {
  id: "pi",
  label: "Pi",
  aliases: ["pi"],

  async available(): Promise<boolean> {
    return fs.pathExists(sessionsRoot());
  },

  async listSessions(): Promise<SessionSummary[]> {
    const files = await fg(["**/*.jsonl"], {
      cwd: sessionsRoot(),
      absolute: true,
      onlyFiles: true,
      suppressErrors: true
    });
    const withStats = await Promise.all(
      files.map(async (file) => ({
        file,
        stat: await fs.stat(file).catch(() => undefined)
      }))
    );
    const recent = withStats
      .filter((item): item is { file: string; stat: fs.Stats } => Boolean(item.stat))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, MAX_LISTED_SESSIONS);

    const sessions = await Promise.all(
      recent.map(async ({ file, stat }) => {
        const parsed = await parseSession(file, 60);
        return {
          ref: file,
          title: inferTitle(parsed.messages, "Pi session"),
          updatedAt: parsed.updatedAt || stat.mtime.toISOString(),
          detail: parsed.workspace
        };
      })
    );
    return sessions;
  },

  async exportSession(ref: string): Promise<PortableContext> {
    const parsed = await parseSession(ref);
    const stat = await fs.stat(ref);
    const fallbackTime = stat.mtime.toISOString();
    return assembleContext({
      source: "pi",
      sourceLabel: "Pi",
      title: inferTitle(parsed.messages, "Pi session"),
      createdAt: parsed.createdAt || fallbackTime,
      updatedAt: parsed.updatedAt || fallbackTime,
      workspace: parsed.workspace,
      messages: parsed.messages,
      rawRefs: [ref],
      sourceRef: { kind: "pi", path: ref, sessionId: parsed.id }
    });
  },

  async exportLatest(): Promise<PortableContext> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new UserError("No Pi sessions found.", `Looked in ${sessionsRoot()}.`);
    }
    return this.exportSession(sessions[0].ref);
  }
};

function sessionsRoot(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions");
}

async function parseSession(filePath: string, maxLines?: number): Promise<ParsedPiSession> {
  const content = await fs.readFile(filePath, "utf8");
  const parsed: ParsedPiSession = { messages: [] };

  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of maxLines ? lines.slice(0, maxLines) : lines) {
    const entry = safeJsonParse(line);
    if (!entry) {
      continue;
    }
    const type = stringValue(entry.type);
    const timestamp = stringValue(entry.timestamp);

    if (type === "session") {
      parsed.id = stringValue(entry.id);
      parsed.createdAt = timestamp;
      parsed.workspace = stringValue(entry.cwd);
      continue;
    }
    if (timestamp) {
      parsed.updatedAt = timestamp;
    }
    if (type !== "message") {
      continue; // model_change, thinking_level_change, etc.
    }

    const message = typeof entry.message === "object" && entry.message ? (entry.message as Record<string, unknown>) : undefined;
    if (message) {
      parsed.messages.push(...extractMessages(message, timestamp));
    }
  }

  return parsed;
}

function extractMessages(message: Record<string, unknown>, timestamp?: string): PortableMessage[] {
  const role = normalizeRole(message.role);
  const content = message.content;
  if (typeof content === "string") {
    return content.trim() ? [{ role, text: content.trim(), timestamp }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const messages: PortableMessage[] = [];
  let textBuffer: string[] = [];
  const flushText = () => {
    const text = textBuffer.join("\n").trim();
    if (text) {
      messages.push({ role, text, timestamp });
    }
    textBuffer = [];
  };

  for (const rawPart of content) {
    if (!rawPart || typeof rawPart !== "object") {
      continue;
    }
    const part = rawPart as Record<string, unknown>;
    const type = stringValue(part.type);

    if (type === "text") {
      const text = stringValue(part.text);
      if (text?.trim()) {
        textBuffer.push(text);
      }
    } else if (type === "toolCall") {
      flushText();
      const name = stringValue(part.name) || "unknown";
      const args = part.arguments !== undefined ? truncate(JSON.stringify(part.arguments), TOOL_INPUT_PREVIEW) : "";
      messages.push({ role: "tool", text: `Tool use: ${name}${args ? ` — ${args}` : ""}`, timestamp });
    } else if (type === "toolResult") {
      flushText();
      const text = extractResultText(part);
      messages.push({ role: "tool", text: text ? `Tool result:\n${truncate(text, TOOL_RESULT_PREVIEW)}` : "Tool result", timestamp });
    }
    // thinking parts and signatures are skipped.
  }
  flushText();

  return messages;
}

function extractResultText(part: Record<string, unknown>): string {
  const direct = stringValue(part.output) || stringValue(part.text) || stringValue(part.result);
  if (direct) {
    return direct;
  }
  const content = part.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item === "object" ? stringValue((item as Record<string, unknown>).text) || "" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function normalizeRole(value: unknown): PortableMessage["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  if (value === "toolResult") {
    return "tool";
  }
  return "unknown";
}
