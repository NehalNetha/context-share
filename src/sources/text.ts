import path from "node:path";
import fs from "fs-extra";
import { UserError } from "../core/errors.js";
import { createContextId, extractCommands, extractFiles } from "../core/extract.js";
import type { PortableContext, PortableMessage } from "../core/schema.js";
import { preview } from "../core/text.js";

/** Import a plain file (Markdown export, notes, any text) as a portable context. */
export async function exportFile(filePath: string): Promise<PortableContext> {
  const absolute = path.resolve(filePath);
  if (!(await fs.pathExists(absolute))) {
    throw new UserError(`File not found: ${absolute}`);
  }
  const content = await fs.readFile(absolute, "utf8");
  const stat = await fs.stat(absolute);
  return contextFromText({
    source: "file",
    title: path.basename(absolute),
    text: content,
    updatedAt: stat.mtime.toISOString(),
    rawRefs: [absolute]
  });
}

/** Import piped stdin as a portable context (e.g. `pbpaste | ctx export stdin`). */
export async function exportStdin(): Promise<PortableContext> {
  const text = await readStdin();
  if (!text.trim()) {
    throw new UserError("No stdin content received.", "Pipe content in, e.g. `pbpaste | ctx export stdin`.");
  }
  return contextFromText({
    source: "stdin",
    title: "stdin export",
    text,
    updatedAt: new Date().toISOString(),
    rawRefs: ["stdin"]
  });
}

function contextFromText(input: {
  source: "file" | "stdin";
  title: string;
  text: string;
  updatedAt: string;
  rawRefs: string[];
}): PortableContext {
  const message: PortableMessage = {
    role: "unknown",
    text: input.text,
    timestamp: input.updatedAt
  };
  return {
    id: createContextId(input.source, input.title, input.updatedAt),
    source: input.source,
    title: input.title,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    goal: preview(input.text) || input.title,
    summary: `Exported ${input.source} context with ${input.text.length} characters.`,
    messages: [message],
    filesMentioned: extractFiles(input.text),
    commands: extractCommands(input.text),
    decisions: [],
    openTasks: [],
    redactions: [],
    rawRefs: input.rawRefs,
    sourceRef: {
      kind: input.source,
      path: input.source === "file" ? input.rawRefs[0] : undefined
    }
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
