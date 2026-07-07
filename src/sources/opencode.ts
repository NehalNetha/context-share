import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import { assembleContext } from "../core/context.js";
import { UserError } from "../core/errors.js";
import { inferTitle } from "../core/extract.js";
import type { PortableContext, PortableMessage } from "../core/schema.js";
import { safeJsonParse, stringValue, truncate } from "../core/text.js";
import { commandExists } from "../platform/command.js";
import type { ContextSource, SessionSummary } from "./types.js";

type SessionRow = {
  id: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
};

type MessageRow = {
  id: string;
  data: string;
  time_created: number;
};

type PartRow = {
  message_id: string;
  data: string;
};

const TOOL_INPUT_PREVIEW = 300;
const TOOL_OUTPUT_PREVIEW = 1500;
const MAX_LISTED_SESSIONS = 100;

export const opencodeSource: ContextSource = {
  id: "opencode",
  label: "OpenCode",
  aliases: ["opencode", "oc"],

  async available(): Promise<boolean> {
    return (await fs.pathExists(dbPath())) && (await commandExists("sqlite3"));
  },

  async listSessions(): Promise<SessionSummary[]> {
    const rows = await query<SessionRow>(
      `SELECT id, title, directory, time_created, time_updated FROM session
       WHERE parent_id IS NULL
       ORDER BY time_updated DESC LIMIT ${MAX_LISTED_SESSIONS}`
    );
    return rows.map((row) => ({
      ref: row.id,
      title: row.title || "OpenCode session",
      updatedAt: new Date(row.time_updated).toISOString(),
      detail: row.directory
    }));
  },

  async exportSession(ref: string): Promise<PortableContext> {
    const id = escapeSqlString(ref);
    const sessions = await query<SessionRow>(
      `SELECT id, title, directory, time_created, time_updated FROM session WHERE id = '${id}'`
    );
    const session = sessions[0];
    if (!session) {
      throw new UserError(`OpenCode session "${ref}" not found.`);
    }

    const messageRows = await query<MessageRow>(
      `SELECT id, data, time_created FROM message WHERE session_id = '${id}' ORDER BY time_created, id`
    );
    const partRows = await query<PartRow>(
      `SELECT message_id, data FROM part WHERE session_id = '${id}' ORDER BY message_id, id`
    );
    const messages = assembleMessages(messageRows, partRows);

    return assembleContext({
      source: "opencode",
      sourceLabel: "OpenCode",
      title: session.title || inferTitle(messages, "OpenCode session"),
      createdAt: new Date(session.time_created).toISOString(),
      updatedAt: new Date(session.time_updated).toISOString(),
      workspace: session.directory || undefined,
      messages,
      rawRefs: [dbPath()],
      sourceRef: { kind: "opencode", path: dbPath(), sessionId: session.id }
    });
  },

  async exportLatest(): Promise<PortableContext> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new UserError("No OpenCode sessions found.", `Looked in ${dbPath()}.`);
    }
    return this.exportSession(sessions[0].ref);
  }
};

/** Turn message rows plus their content parts into portable messages (exported for tests). */
export function assembleMessages(messageRows: MessageRow[], partRows: PartRow[]): PortableMessage[] {
  const partsByMessage = new Map<string, PartRow[]>();
  for (const part of partRows) {
    const list = partsByMessage.get(part.message_id) ?? [];
    list.push(part);
    partsByMessage.set(part.message_id, list);
  }

  const messages: PortableMessage[] = [];
  for (const row of messageRows) {
    const data = safeJsonParse(row.data);
    if (!data) {
      continue;
    }
    const role = normalizeRole(data.role);
    const timestamp = new Date(row.time_created).toISOString();

    let textBuffer: string[] = [];
    const flushText = () => {
      const text = textBuffer.join("\n").trim();
      if (text) {
        messages.push({ role, text, timestamp });
      }
      textBuffer = [];
    };

    for (const partRow of partsByMessage.get(row.id) ?? []) {
      const part = safeJsonParse(partRow.data);
      if (!part) {
        continue;
      }
      const type = stringValue(part.type);
      if (type === "text") {
        const text = stringValue(part.text);
        if (text?.trim()) {
          textBuffer.push(text);
        }
      } else if (type === "tool") {
        flushText();
        messages.push({ role: "tool", text: formatToolPart(part), timestamp });
      }
      // reasoning, step-start, step-finish, snapshots etc. are internal noise — skipped.
    }
    flushText();
  }
  return messages;
}

function formatToolPart(part: Record<string, unknown>): string {
  const tool = stringValue(part.tool) || "unknown";
  const state = typeof part.state === "object" && part.state ? (part.state as Record<string, unknown>) : {};
  const input = state.input !== undefined ? truncate(JSON.stringify(state.input), TOOL_INPUT_PREVIEW) : "";
  const output = stringValue(state.output);

  const lines = [`Tool use: ${tool}${input ? ` — ${input}` : ""}`];
  if (output?.trim()) {
    lines.push(`Tool result:\n${truncate(output, TOOL_OUTPUT_PREVIEW)}`);
  }
  return lines.join("\n");
}

function normalizeRole(value: unknown): PortableMessage["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  return "unknown";
}

function dbPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");
}

async function query<T>(sql: string): Promise<T[]> {
  if (!(await commandExists("sqlite3"))) {
    throw new UserError("Reading OpenCode sessions requires the sqlite3 command.", "On macOS it ships with the OS; on Linux install the sqlite3 package.");
  }
  const { stdout } = await execa("sqlite3", ["-readonly", "-json", dbPath(), sql]);
  return stdout.trim() ? (JSON.parse(stdout) as T[]) : [];
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
