import { execa } from "execa";
import { renderForSend } from "../core/render.js";
import { commandExists } from "../platform/command.js";
import type { ContextDestination, SendResult } from "./types.js";
import { resolveLaunchCwd } from "./workspace.js";

/** Keep the prompt comfortably under ARG_MAX so it can be passed as a CLI argument. */
const MAX_ARG_PROMPT_LENGTH = 100_000;

export const claudeCliDestination: ContextDestination = {
  id: "claude",
  label: "Claude Code",
  aliases: ["claude", "claude-code", "claude-cli"],

  async available(): Promise<boolean> {
    return commandExists("claude");
  },

  async send(context, options): Promise<SendResult> {
    const rendered = renderForSend(context, options.mode, options.filters);
    const { cwd, note } = await resolveLaunchCwd(context);
    const messages = note ? [note] : [];

    if (rendered.length <= MAX_ARG_PROMPT_LENGTH) {
      messages.push(`Launching Claude Code in ${cwd} with the exported context.`);
      await execa("claude", [rendered], { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    } else {
      messages.push(`Context is large; piping it to Claude Code in ${cwd} (print mode).`);
      await execa("claude", [], { cwd, input: rendered, stdout: "inherit", stderr: "inherit" });
    }
    return { messages };
  }
};
