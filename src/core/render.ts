import type { PortableContext } from "./schema.js";
import { truncate } from "./text.js";

export type RenderMode = "compact" | "full";

/** Render-time filters; nothing is removed from the stored context itself. */
export type RenderFilters = {
  /** How many recent messages the compact prompt includes (default 8). */
  messageCount?: number;
  /** Include tool activity (commands, edits, tool output) in the conversation. Default true. */
  includeTools?: boolean;
  /** Include the "Relevant files" list. Default true. */
  includeFiles?: boolean;
};

const COMPACT_LIST_LIMIT = 12;
const COMPACT_MESSAGE_COUNT = 8;
const COMPACT_MESSAGE_LENGTH = 1800;

/** Render a saved context as a standalone Markdown document. */
export function renderMarkdown(context: PortableContext, mode: RenderMode = "compact", filters: RenderFilters = {}): string {
  const full = mode === "full";
  const listLimit = full ? Number.POSITIVE_INFINITY : COMPACT_LIST_LIMIT;
  const lines: string[] = [];

  lines.push(`# ${context.title}`);
  lines.push("");
  lines.push(`Source: ${context.source}`);
  lines.push(`Updated: ${context.updatedAt}`);
  if (context.workspace) {
    lines.push(`Workspace: ${context.workspace}`);
  }
  if (context.goal) {
    lines.push(`Goal: ${context.goal}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(context.summary || "No summary available.");
  lines.push("");
  appendList(lines, "Decisions", context.decisions, listLimit);
  appendList(lines, "Open Tasks", context.openTasks, listLimit);
  if (filters.includeFiles !== false) {
    appendList(lines, "Relevant Files", context.filesMentioned, listLimit);
  }
  appendList(lines, "Recent Commands", context.commands, listLimit);
  appendMessages(lines, filterMessages(context, filters), full);
  appendList(lines, "Raw References", context.rawRefs, listLimit);
  appendRedactions(lines, context);

  return `${lines.join("\n").trim()}\n`;
}

/** Render the compact handoff prompt used when injecting a context into another assistant. */
export function renderInjectionPrompt(context: PortableContext, filters: RenderFilters = {}): string {
  const messages = filterMessages(context, filters);
  return [
    "You are continuing work from an exported AI coding session.",
    "",
    `Source: ${context.source}`,
    context.workspace ? `Workspace: ${context.workspace}` : undefined,
    context.goal ? `Goal: ${context.goal}` : undefined,
    "",
    "Summary:",
    context.summary || "No summary available.",
    "",
    "Decisions:",
    renderPlainList(context.decisions),
    "",
    "Open tasks:",
    renderPlainList(context.openTasks),
    "",
    ...(filters.includeFiles !== false ? ["Relevant files:", renderPlainList(context.filesMentioned), ""] : []),
    "Recent commands:",
    renderPlainList(context.commands),
    "",
    "Recent conversation:",
    renderRecentConversation(messages, filters.messageCount ?? COMPACT_MESSAGE_COUNT),
    "",
    "Continue from this context and ask only if required."
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

/** Render whichever representation fits the requested mode for sending to a destination. */
export function renderForSend(context: PortableContext, mode: RenderMode, filters: RenderFilters = {}): string {
  return mode === "full" ? renderMarkdown(context, "full", filters) : renderInjectionPrompt(context, filters);
}

function filterMessages(context: PortableContext, filters: RenderFilters): PortableContext["messages"] {
  if (filters.includeTools === false) {
    return context.messages.filter((message) => message.role !== "tool");
  }
  return context.messages;
}

function appendList(lines: string[], title: string, items: string[], limit: number): void {
  if (items.length === 0) {
    return;
  }
  lines.push(`## ${title}`);
  lines.push("");
  for (const item of items.slice(0, limit)) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function appendMessages(lines: string[], allMessages: PortableContext["messages"], full: boolean): void {
  if (allMessages.length === 0) {
    return;
  }
  lines.push(full ? "## Full Conversation" : "## Recent Conversation");
  lines.push("");
  const messages = full ? allMessages : allMessages.slice(-COMPACT_MESSAGE_COUNT);
  for (const message of messages) {
    lines.push(`### ${message.role}${message.timestamp ? ` (${message.timestamp})` : ""}`);
    lines.push("");
    lines.push(full ? message.text : truncate(message.text, COMPACT_MESSAGE_LENGTH));
    lines.push("");
  }
}

function appendRedactions(lines: string[], context: PortableContext): void {
  if (context.redactions.length === 0) {
    return;
  }
  lines.push("## Redactions");
  lines.push("");
  for (const redaction of context.redactions) {
    lines.push(`- ${redaction.kind}: ${redaction.count}`);
  }
  lines.push("");
}

function renderPlainList(items: string[]): string {
  if (items.length === 0) {
    return "- None captured.";
  }
  return items
    .slice(0, COMPACT_LIST_LIMIT)
    .map((item) => `- ${item}`)
    .join("\n");
}

function renderRecentConversation(messages: PortableContext["messages"], messageCount: number): string {
  if (messages.length === 0) {
    return "- None captured.";
  }
  return messages
    .slice(-messageCount)
    .map((message) => `- ${message.role}: ${truncate(message.text.replace(/\s+/g, " "), 500)}`)
    .join("\n");
}
