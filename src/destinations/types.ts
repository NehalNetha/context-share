import type { RenderFilters, RenderMode } from "../core/render.js";
import type { PortableContext } from "../core/schema.js";

export type SendOptions = {
  mode: RenderMode;
  filters?: RenderFilters;
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
