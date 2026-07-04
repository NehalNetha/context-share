import type { RenderMode } from "../core/render.js";
import type { PortableContext } from "../core/schema.js";

export type SendOptions = {
  mode: RenderMode;
  /** How many recent messages the compact prompt includes (default 8). */
  messageCount?: number;
};

export type SendResult = {
  /** Human-readable lines describing what happened. */
  messages: string[];
};

/** A place ctx can deliver a saved context to. */
export type ContextDestination = {
  id: string;
  label: string;
  aliases: string[];
  available(): Promise<boolean>;
  send(context: PortableContext, options: SendOptions): Promise<SendResult>;
};
