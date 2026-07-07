import { execa } from "execa";
import { renderForSend } from "../core/render.js";
import { commandExists } from "../platform/command.js";
import { copyToClipboard } from "./clipboard.js";
import type { ContextDestination, SendResult } from "./types.js";
import { resolveLaunchCwd } from "./workspace.js";

/** Keep the prompt comfortably under ARG_MAX so it can be passed as a CLI argument. */
const MAX_ARG_PROMPT_LENGTH = 100_000;

export const piCliDestination: ContextDestination = {
  id: "pi",
  label: "Pi",
  aliases: ["pi"],

  async available(): Promise<boolean> {
    return commandExists("pi");
  },

  async send(context, options): Promise<SendResult> {
    const rendered = renderForSend(context, options.mode, options.filters);
    const { cwd, note } = await resolveLaunchCwd(context);
    const messages = note ? [note] : [];

    if (rendered.length <= MAX_ARG_PROMPT_LENGTH) {
      messages.push(`Launching Pi in ${cwd} with the exported context.`);
      await execa("pi", [rendered], { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    } else {
      const chars = await copyToClipboard(context, options.mode, options.filters);
      messages.push(`Context is too large to pass directly; copied ${chars.toLocaleString()} characters to the clipboard.`);
      messages.push(`Launching Pi in ${cwd} — paste with Cmd+V to hand off.`);
      await execa("pi", [], { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    }
    return { messages };
  }
};
