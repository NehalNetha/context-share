import { UserError } from "../core/errors.js";
import type { PortableContext } from "../core/schema.js";
import { redactContext } from "../core/redact.js";
import { renderForSend } from "../core/render.js";
import { readIndex, saveContext, storeRoot } from "../core/store.js";
import { estimateTokens, formatTokens } from "../core/text.js";
import type { ContextDestination } from "../destinations/types.js";
import { destinations } from "../destinations/index.js";
import type { ContextSource } from "../sources/types.js";
import { formatWhen, info, select, success } from "./ui.js";

const MAX_PICKER_SESSIONS = 50;

export async function pickAndExportSession(source: ContextSource): Promise<PortableContext> {
  const sessions = await source.listSessions();
  if (sessions.length === 0) {
    throw new UserError(`No ${source.label} sessions found.`);
  }
  const ref = await select(
    `${source.label} session`,
    sessions.slice(0, MAX_PICKER_SESSIONS).map((session) => ({
      title: session.title,
      description: [formatWhen(session.updatedAt), session.detail].filter(Boolean).join(" · "),
      value: session.ref
    }))
  );
  return source.exportSession(ref);
}

export async function pickSavedContextId(): Promise<string> {
  const index = await readIndex();
  if (index.sessions.length === 0) {
    throw new UserError(`No saved contexts found in ${storeRoot()}.`);
  }
  return select(
    "Saved context",
    index.sessions.map((session) => ({
      title: session.title,
      description: `${session.source} · ${formatWhen(session.updatedAt)}`,
      value: session.id
    }))
  );
}

export async function pickDestination(): Promise<ContextDestination> {
  const availability = await Promise.all(destinations.map((destination) => destination.available()));
  const choices = destinations.map((destination, index) => ({
    title: availability[index] ? destination.label : `${destination.label} (not detected)`,
    value: destination
  }));
  return select("Destination", choices);
}

export async function saveAndReport(context: PortableContext): Promise<PortableContext> {
  const redacted = redactContext(context);
  const saved = await saveContext(redacted);
  const compactTokens = estimateTokens(renderForSend(redacted, "compact"));
  const fullTokens = estimateTokens(renderForSend(redacted, "full"));
  success(`Saved context ${saved.id}`);
  info(`  JSON:     ${saved.jsonPath}`);
  info(`  Markdown: ${saved.markdownPath}`);
  info(`  Size:     ~${formatTokens(compactTokens)} tokens compact · ~${formatTokens(fullTokens)} tokens full`);
  if (redacted.redactions.length > 0) {
    const details = redacted.redactions.map((item) => `${item.kind} x${item.count}`).join(", ");
    info(`  Redacted: ${details}`);
  }
  return redacted;
}
