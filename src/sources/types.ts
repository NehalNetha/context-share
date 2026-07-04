import type { PortableContext } from "../core/schema.js";

export type SessionSummary = {
  /** Opaque handle passed back to exportSession (session id or file path). */
  ref: string;
  title: string;
  updatedAt: string;
  detail?: string;
};

/** A place ctx can pull conversation history from (Codex, Claude Code, ...). */
export type ContextSource = {
  id: string;
  label: string;
  aliases: string[];
  available(): Promise<boolean>;
  listSessions(): Promise<SessionSummary[]>;
  exportSession(ref: string): Promise<PortableContext>;
  exportLatest(): Promise<PortableContext>;
};
