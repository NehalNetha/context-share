#!/usr/bin/env node
import { Command } from "commander";
import {
  deleteCommand,
  doctorCommand,
  exportCommand,
  handoffCommand,
  listCommand,
  renderCommand,
  searchCommand,
  sendCommand,
  shareCommand,
  showCommand
} from "./cli/commands.js";
import { printError } from "./cli/ui.js";
import { UserError } from "./core/errors.js";

const program = new Command();

program
  .name("ctx")
  .description("Share AI coding context between Codex and Claude Code.")
  .version("0.3.0");

program
  .command("share", { isDefault: true })
  .description("Interactive flow: pick a session, pick a destination, hand off")
  .action(wrap(shareCommand));

program
  .command("export [source]")
  .description("Export a session from codex, claude, file, or stdin into the local store")
  .option("--from <source>", "source: codex, claude, file, or stdin")
  .option("--last", "export the most recent session without prompting")
  .option("--file <path>", "file path when exporting from a file")
  .action(wrap(exportCommand));

program
  .command("send [destination] [id]")
  .description("Send a saved context to claude, codex, clipboard, or stdout")
  .option("--last", "send the most recent saved context")
  .option("--full", "send the full transcript instead of the compact handoff prompt")
  .option("--messages <n>", "number of recent messages in the compact prompt (default 8)")
  .action(wrap(sendCommand));

program
  .command("handoff <from> <to>")
  .description("Export the latest session from one tool and send it to another (e.g. ctx handoff codex claude)")
  .option("--full", "send the full transcript instead of the compact handoff prompt")
  .option("--messages <n>", "number of recent messages in the compact prompt (default 8)")
  .action(wrap(handoffCommand));

program
  .command("search <term>")
  .description("Search saved contexts for a term")
  .action(wrap(searchCommand));

program
  .command("list")
  .description("List saved contexts")
  .action(wrap(listCommand));

program
  .command("show <id>")
  .description("Print a saved context's Markdown (use an ID prefix or 'last')")
  .action(wrap(showCommand));

program
  .command("render [id]")
  .description("Render a saved context to stdout")
  .option("--last", "render the most recent saved context")
  .option("--full", "render the full transcript")
  .option("--messages <n>", "number of recent messages in the compact prompt (default 8)")
  .action(wrap(renderCommand));

program
  .command("delete <id>")
  .description("Delete a saved context")
  .action(wrap(deleteCommand));

program
  .command("doctor")
  .description("Check which sources, destinations, and permissions are available")
  .action(wrap(doctorCommand));

program.parseAsync(process.argv);

function wrap<Args extends unknown[]>(fn: (...args: Args) => Promise<void>): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (error) {
      if (error instanceof UserError && error.message === "Cancelled.") {
        process.exitCode = 130;
        return;
      }
      printError(error);
      process.exitCode = 1;
    }
  };
}
