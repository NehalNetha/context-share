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

type ParsedClaudeSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspace?: string;
  messages: PortableMessage[];
};

const PREVIEW_LINE_COUNT = 80;
const MAX_LISTED_SESSIONS = 100;

export const claudeCodeSource: ContextSource = {
  id: "claude-code",
  label: "Claude Code",
  aliases: ["claude", "claude-code", "cc"],

  async available(): Promise<boolean> {
    return fs.pathExists(claudeProjectsRoot());
  },

  async listSessions(): Promise<SessionSummary[]> {
    const files = await findSessionFiles();
    const withStats = await Promise.all(
      files.map(async (file) => ({
        file,
        stat: await fs.stat(file).catch(() => undefined)
      }))
    );

    const recentFiles = withStats
      .filter((item): item is { file: string; stat: fs.Stats } => Boolean(item.stat))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, MAX_LISTED_SESSIONS);

    const sessions = await Promise.all(
      recentFiles.map(async ({ file, stat }) => {
        const parsed = await parseSession(file, PREVIEW_LINE_COUNT);
        return {
          ref: file,
          title: parsed.title,
          updatedAt: parsed.updatedAt || stat.mtime.toISOString(),
          detail: parsed.workspace
        };
      })
    );

    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async exportSession(ref: string): Promise<PortableContext> {
    const parsed = await parseSession(ref);
    return assembleContext({
      source: "claude-code",
      sourceLabel: "Claude Code",
      title: parsed.title,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      workspace: parsed.workspace,
      messages: parsed.messages,
      rawRefs: [ref],
      sourceRef: { kind: "claude-code", path: ref, sessionId: parsed.id }
    });
  },

  async exportLatest(): Promise<PortableContext> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new UserError("No Claude Code sessions found.", `Looked in ${claudeProjectsRoot()}.`);
    }
    return this.exportSession(sessions[0].ref);
  }
};

function claudeProjectsRoot(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

async function findSessionFiles(): Promise<string[]> {
  return fg(["**/*.jsonl"], {
    cwd: claudeProjectsRoot(),
    absolute: true,
    onlyFiles: true,
    suppressErrors: true,
    ignore: ["**/tool-results/**", "**/memory/**"]
  });
}

async function parseSession(filePath: string, maxLines?: number): Promise<ParsedClaudeSession> {
  const content = await fs.readFile(filePath, "utf8");
  const messages: PortableMessage[] = [];
  const id = path.basename(filePath, ".jsonl");
  let workspace: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;

  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of maxLines ? lines.slice(0, maxLines) : lines) {
    const entry = safeJsonParse(line);
    if (!entry) {
      continue;
    }

    const timestamp = stringValue(entry.timestamp);
    createdAt ??= timestamp;
    updatedAt = timestamp || updatedAt;
    workspace ||= stringValue(entry.cwd);

    messages.push(...extractMessages(entry, timestamp));
  }

  const stat = await fs.stat(filePath);
  const fallbackTime = stat.mtime.toISOString();

  return {
    id,
    title: inferTitle(messages, path.basename(path.dirname(filePath))),
    createdAt: createdAt || fallbackTime,
    updatedAt: updatedAt || fallbackTime,
    workspace,
    messages
  };
}

/**
 * Split one transcript entry into portable messages. Tool activity (tool_use /
 * tool_result parts) becomes separate role:"tool" messages so it can be
 * filtered out at render time.
 */
function extractMessages(entry: Record<string, unknown>, timestamp?: string): PortableMessage[] {
  const type = stringValue(entry.type);
  if (type !== "user" && type !== "assistant" && type !== "system") {
    return [];
  }

  const rawMessage = typeof entry.message === "object" && entry.message ? (entry.message as Record<string, unknown>) : entry;
  const role = normalizeRole(rawMessage.role || type);

  if (!Array.isArray(rawMessage.content)) {
    const text = typeof rawMessage.content === "string"
      ? rawMessage.content
      : stringValue(rawMessage.text) || stringValue(rawMessage.summary) || "";
    return text.trim() ? [{ role, text: text.trim(), timestamp }] : [];
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

  for (const part of rawMessage.content) {
    const partType = part && typeof part === "object" ? stringValue((part as Record<string, unknown>).type) : undefined;
    const text = extractContentPart(part);
    if (!text) {
      continue;
    }
    if (partType === "tool_use" || partType === "tool_result") {
      flushText();
      messages.push({ role: "tool", text, timestamp });
    } else {
      textBuffer.push(text);
    }
  }
  flushText();

  return messages;
}

/** Keep tool substance in exports without letting one huge diff or log dominate the transcript. */
const TOOL_INPUT_PREVIEW = 600;
const TOOL_RESULT_PREVIEW = 1500;

function extractContentPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  const record = part as Record<string, unknown>;
  const type = stringValue(record.type);
  if (type === "text") {
    return stringValue(record.text) || "";
  }
  if (type === "tool_use") {
    return formatToolUse(record);
  }
  if (type === "tool_result") {
    const text = extractToolResultText(record.content);
    return text ? `Tool result:\n${truncate(text, TOOL_RESULT_PREVIEW)}` : "Tool result";
  }
  if (type === "file") {
    return stringValue(record.filename) || "";
  }
  return stringValue(record.text) || stringValue(record.content) || "";
}

function formatToolUse(record: Record<string, unknown>): string {
  const name = stringValue(record.name) || "unknown";
  const input = typeof record.input === "object" && record.input ? (record.input as Record<string, unknown>) : {};
  const filePath = stringValue(input.file_path) || stringValue(input.path) || stringValue(input.notebook_path);

  if (name === "Bash") {
    const command = stringValue(input.command);
    return command ? `Tool use: Bash — ${truncate(command, TOOL_INPUT_PREVIEW)}` : "Tool use: Bash";
  }
  if (name === "Edit") {
    const newString = stringValue(input.new_string);
    const header = `Tool use: Edit ${filePath || ""}`.trim();
    return newString ? `${header}\nNew content:\n${truncate(newString, TOOL_INPUT_PREVIEW)}` : header;
  }
  if (name === "Write") {
    const content = stringValue(input.content);
    const header = `Tool use: Write ${filePath || ""}`.trim();
    return content ? `${header}\nContent:\n${truncate(content, TOOL_INPUT_PREVIEW)}` : header;
  }
  if (filePath) {
    return `Tool use: ${name} ${filePath}`;
  }

  const inputSummary = Object.keys(input).length > 0 ? truncate(JSON.stringify(input), 200) : "";
  return inputSummary ? `Tool use: ${name} — ${inputSummary}` : `Tool use: ${name}`;
}

function extractToolResultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object") {
        return stringValue((part as Record<string, unknown>).text) || "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeRole(value: unknown): PortableMessage["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  return "unknown";
}
