import clipboard from "clipboardy";
import { renderForSend } from "../core/render.js";
import type { PortableContext } from "../core/schema.js";
import type { RenderFilters, RenderMode } from "../core/render.js";
import type { ContextDestination, SendResult } from "./types.js";

export async function copyToClipboard(context: PortableContext, mode: RenderMode, filters?: RenderFilters): Promise<number> {
  const prompt = renderForSend(context, mode, filters);
  await clipboard.write(prompt);
  return prompt.length;
}

export const clipboardDestination: ContextDestination = {
  id: "clipboard",
  label: "Clipboard (paste anywhere, incl. desktop apps)",
  aliases: ["clipboard", "copy"],

  async available(): Promise<boolean> {
    return true;
  },

  async send(context, options): Promise<SendResult> {
    const chars = await copyToClipboard(context, options.mode, options.filters);
    return { messages: [`Copied ${chars.toLocaleString()} characters to the clipboard.`] };
  }
};

export const stdoutDestination: ContextDestination = {
  id: "stdout",
  label: "Stdout",
  aliases: ["stdout", "print"],

  async available(): Promise<boolean> {
    return true;
  },

  async send(context, options): Promise<SendResult> {
    const rendered = renderForSend(context, options.mode, options.filters);
    process.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
    return { messages: [] };
  }
};
