import crypto from "node:crypto";
import type { PortableMessage } from "./schema.js";
import { truncate, unique } from "./text.js";

const FILE_PATH_PATTERN = /(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.[A-Za-z0-9]{1,8}(?::\d+)?/g;
const INLINE_COMMAND_PATTERN =
  /`([^`\n]*(?:npm|pnpm|yarn|node|python|python3|git|codex|claude|ctx|rg|find|ls|cat|sed)[^`\n]*)`/g;
const FENCED_BLOCK_PATTERN = /```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/gi;

export const DECISION_KEYWORDS = ["decision", "decided", "choose", "chosen"];
export const OPEN_TASK_KEYWORDS = ["todo", "next", "remaining", "open task", "follow up"];

export function extractFiles(text: string): string[] {
  return unique(text.match(FILE_PATH_PATTERN) ?? []).slice(0, 30);
}

export function extractCommands(text: string): string[] {
  const fenced = [...text.matchAll(FENCED_BLOCK_PATTERN)].flatMap((match) =>
    match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const inline = [...text.matchAll(INLINE_COMMAND_PATTERN)].map((match) => match[1].trim());
  return unique([...fenced, ...inline]).slice(0, 30);
}

export function extractBullets(text: string, keywords: string[]): string[] {
  return unique(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)))
      .map((line) => truncate(line, 240))
  ).slice(0, 12);
}

export function inferTitle(messages: PortableMessage[], fallback: string): string {
  const firstUser = messages.find((message) => message.role === "user")?.text;
  return truncate((firstUser || fallback).replace(/\s+/g, " "), 80);
}

export function inferGoal(messages: PortableMessage[], title: string): string {
  const firstUser = messages.find((message) => message.role === "user")?.text;
  return truncate((firstUser || title).replace(/\s+/g, " "), 240);
}

export function summarizeMessages(messages: PortableMessage[], title: string, sourceLabel: string): string {
  const lastUser = messages.filter((message) => message.role === "user").at(-1)?.text;
  const lastAssistant = messages.filter((message) => message.role === "assistant").at(-1)?.text;
  const parts = [`Exported ${sourceLabel} context for "${title}".`];
  if (lastUser) {
    parts.push(`Latest user request: ${truncate(lastUser.replace(/\s+/g, " "), 500)}`);
  }
  if (lastAssistant) {
    parts.push(`Latest assistant response: ${truncate(lastAssistant.replace(/\s+/g, " "), 500)}`);
  }
  return parts.join("\n\n");
}

export function createContextId(source: string, title: string, updatedAt: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${source}:${title}:${updatedAt}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  return `${source}-${hash}`;
}
