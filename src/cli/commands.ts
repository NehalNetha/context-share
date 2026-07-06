import pc from "picocolors";
import type { Command } from "commander";
import { CONFIG_DEFAULTS, configPath, readConfig, setConfigValue, toggleConfigValue, writeConfig } from "../core/config.js";
import { UserError } from "../core/errors.js";
import type { PortableContext } from "../core/schema.js";
import { renderForSend, type RenderFilters, type RenderMode } from "../core/render.js";
import { deleteContext, loadContext, readIndex, readMarkdown, storeRoot } from "../core/store.js";
import { estimateTokens, formatTokens, preview } from "../core/text.js";
import fs from "fs-extra";
import { destinations, findDestination } from "../destinations/index.js";
import type { ContextDestination } from "../destinations/types.js";
import { findSource, sources } from "../sources/index.js";
import { exportFile, exportStdin } from "../sources/text.js";
import { pickAndExportSession, pickDestination, pickSavedContextId, saveAndReport } from "./pickers.js";
import { askNumber, formatWhen, info, isInteractive, multiselect, printSendResult, select, success } from "./ui.js";

export type ExportOptions = {
  from?: string;
  last?: boolean;
  file?: string;
};

export async function exportCommand(sourceArg: string | undefined, options: ExportOptions): Promise<void> {
  const sourceName = options.from || sourceArg;
  if (!sourceName) {
    throw new UserError(
      "Choose a source to export from.",
      "Examples: `ctx export codex --last`, `ctx export claude`, `ctx export file --file notes.md`, `ctx export stdin`."
    );
  }

  let context: PortableContext;
  if (sourceName === "file") {
    if (!options.file) {
      throw new UserError("Provide a file path with --file <path>.");
    }
    context = await exportFile(options.file);
  } else if (sourceName === "stdin") {
    context = await exportStdin();
  } else {
    const source = findSource(sourceName);
    context = options.last || !isInteractive() ? await source.exportLatest() : await pickAndExportSession(source);
  }

  await saveAndReport(context);
}

export async function listCommand(): Promise<void> {
  const index = await readIndex();
  if (index.sessions.length === 0) {
    info(`No contexts saved yet. Store: ${storeRoot()}`);
    return;
  }
  for (const entry of index.sessions) {
    console.log(`${pc.cyan(entry.id)}  ${pc.bold(entry.source)}  ${pc.dim(formatWhen(entry.updatedAt))}`);
    console.log(`  ${entry.title}`);
    console.log(pc.dim(`  ${preview(entry.summary)}`));
  }
}

export async function showCommand(id: string): Promise<void> {
  process.stdout.write(await readMarkdown(id));
}

export type ContentOptions = {
  full?: boolean;
  messages?: string;
  tools?: boolean;
  files?: boolean;
};

export type RenderOptions = ContentOptions & {
  last?: boolean;
};

export async function renderCommand(id: string | undefined, options: RenderOptions, command: Command): Promise<void> {
  const context = await loadContext(options.last ? "last" : id || "last");
  const rendered = renderForSend(context, options.full ? "full" : "compact", await resolveFilters(options, command));
  process.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
}

export type SendCommandOptions = ContentOptions & {
  last?: boolean;
};

export async function sendCommand(
  destinationArg: string | undefined,
  idArg: string | undefined,
  options: SendCommandOptions,
  command: Command
): Promise<void> {
  const context = await loadContext(resolveContextRef(idArg, options.last) ?? (isInteractive() ? await pickSavedContextId() : "last"));
  const destination = destinationArg ? findDestination(destinationArg) : await requireInteractiveDestination();
  await sendWithTokenReport(destination, context, options.full ? "full" : "compact", await resolveFilters(options, command));
}

/** Export the latest session from one tool and send it straight to another. */
export async function handoffCommand(fromArg: string, toArg: string, options: ContentOptions, command: Command): Promise<void> {
  const source = findSource(fromArg);
  const destination = findDestination(toArg);
  const context = await saveAndReport(await source.exportLatest());
  await sendWithTokenReport(destination, context, options.full ? "full" : "compact", await resolveFilters(options, command));
}

export async function configCommand(key: string | undefined, value: string | undefined): Promise<void> {
  // Scripting escape hatch: `ctx config tools off`, `ctx config messages 20`, `ctx config reset`.
  if (key === "reset") {
    await writeConfig({});
    success("Reset all settings to defaults.");
    return;
  }
  if (key && value !== undefined) {
    await setConfigValue(key, value);
    success(`Set ${key} = ${value}.`);
    return;
  }
  if (key === "tools" || key === "files") {
    const next = await toggleConfigValue(key);
    success(`${key} is now ${next ? "on" : "off"}.`);
    return;
  }
  if (key) {
    throw new UserError(`Unknown setting "${key}".`, "Available settings: tools, files, messages.");
  }

  if (!isInteractive()) {
    printSettings(await readConfig());
    return;
  }

  await interactiveConfig();
}

async function interactiveConfig(): Promise<void> {
  for (;;) {
    const config = await readConfig();
    const tools = config.tools ?? CONFIG_DEFAULTS.tools;
    const files = config.files ?? CONFIG_DEFAULTS.files;
    const messages = config.messages ?? CONFIG_DEFAULTS.messages;

    let choice: "tools" | "files" | "messages" | "reset" | "done";
    try {
      choice = await select("Settings — enter to change", [
        { title: `Tool activity      ${onOff(tools)}`, value: "tools", description: "commands, edits, tool output in sent contexts" },
        { title: `Files list         ${onOff(files)}`, value: "files", description: "the relevant-files section in sent contexts" },
        { title: `Compact messages   ${pc.bold(String(messages))}`, value: "messages", description: "recent messages in the compact prompt" },
        { title: "Reset to defaults", value: "reset" },
        { title: "Done", value: "done" }
      ]);
    } catch {
      return; // esc/ctrl-c just closes the list
    }

    if (choice === "done") {
      return;
    }
    if (choice === "reset") {
      await writeConfig({});
      continue;
    }
    if (choice === "messages") {
      try {
        const next = await askNumber("Recent messages in the compact prompt", messages);
        if (Number.isInteger(next) && next >= 1) {
          await setConfigValue("messages", String(next));
        }
      } catch {
        // cancelled — keep current value
      }
      continue;
    }
    await toggleConfigValue(choice);
  }
}

function onOff(value: boolean): string {
  return value ? pc.green("on ") : pc.red("off");
}

function printSettings(config: Awaited<ReturnType<typeof readConfig>>): void {
  info(pc.bold("Settings") + pc.dim(`  (${configPath()})`));
  printSetting("tools", config.tools, CONFIG_DEFAULTS.tools, "include tool activity in sent contexts");
  printSetting("files", config.files, CONFIG_DEFAULTS.files, "include the relevant-files list");
  printSetting("messages", config.messages, CONFIG_DEFAULTS.messages, "recent messages in the compact prompt");
}

export async function searchCommand(term: string): Promise<void> {
  const index = await readIndex();
  if (index.sessions.length === 0) {
    info(`No contexts saved yet. Store: ${storeRoot()}`);
    return;
  }

  const needle = term.toLowerCase();
  let hits = 0;
  for (const entry of index.sessions) {
    const markdown = await fs.readFile(entry.markdownPath, "utf8").catch(() => "");
    const haystack = `${entry.title}\n${markdown}`;
    const matchLine = haystack.split(/\r?\n/).find((line) => line.toLowerCase().includes(needle));
    if (matchLine === undefined) {
      continue;
    }
    hits += 1;
    console.log(`${pc.cyan(entry.id)}  ${pc.bold(entry.source)}  ${pc.dim(formatWhen(entry.updatedAt))}`);
    console.log(`  ${entry.title}`);
    console.log(pc.dim(`  ${preview(matchLine, 140)}`));
  }

  if (hits === 0) {
    info(`No saved contexts match "${term}".`);
  }
}

export async function deleteCommand(id: string): Promise<void> {
  const entry = await deleteContext(id);
  success(`Deleted context ${entry.id} (${entry.title}).`);
}

export async function shareCommand(): Promise<void> {
  if (!isInteractive()) {
    throw new UserError("`ctx share` is interactive.", "In scripts, use `ctx export` and `ctx send` instead.");
  }

  const sourceChoices = [
    ...sources.map((source) => ({ title: source.label, value: source.id })),
    { title: "Saved context", value: "saved" },
    { title: "File", value: "file-prompt" }
  ];
  const picked = await select("Source", sourceChoices);

  let context: PortableContext;
  if (picked === "saved") {
    context = await loadContext(await pickSavedContextId());
  } else if (picked === "file-prompt") {
    const prompts = (await import("prompts")).default;
    const answer = await prompts({ type: "text", name: "path", message: "File path" });
    if (!answer.path) {
      throw new UserError("Cancelled.");
    }
    context = await saveAndReport(await exportFile(answer.path));
  } else {
    context = await saveAndReport(await pickAndExportSession(findSource(picked)));
  }

  const destination = await pickDestination();
  const mode = await select<RenderMode>("Context size", [
    { title: "Compact (summary + recent conversation)", value: "compact" },
    { title: "Full (entire transcript)", value: "full" }
  ]);

  const config = await readConfig();
  const include = await multiselect<"tools" | "files">("Include", [
    { title: "Tool activity (commands, edits, output)", value: "tools", selected: config.tools ?? CONFIG_DEFAULTS.tools },
    { title: "Relevant files list", value: "files", selected: config.files ?? CONFIG_DEFAULTS.files }
  ]);

  await sendWithTokenReport(destination, context, mode, {
    includeTools: include.includes("tools"),
    includeFiles: include.includes("files"),
    messageCount: config.messages
  });
}

export async function doctorCommand(): Promise<void> {
  info(pc.bold("ctx doctor"));
  info("");

  info(pc.bold("Sources"));
  for (const source of sources) {
    const ok = await source.available();
    info(`  ${statusIcon(ok)} ${source.label}${ok ? "" : "  (session directory not found)"}`);
  }

  info("");
  info(pc.bold("Destinations"));
  for (const destination of destinations) {
    const ok = await destination.available();
    info(`  ${statusIcon(ok)} ${destination.label}${ok ? "" : "  (not detected)"}`);
  }

  info("");
  info(pc.bold("Store"));
  const index = await readIndex();
  info(`  Path: ${storeRoot()}`);
  info(`  Saved contexts: ${index.sessions.length}`);
}

function statusIcon(ok: boolean): string {
  return ok ? pc.green("✓") : pc.red("✗");
}

async function sendWithTokenReport(
  destination: ContextDestination,
  context: PortableContext,
  mode: RenderMode,
  filters: RenderFilters = {}
): Promise<void> {
  const tokens = estimateTokens(renderForSend(context, mode, filters));
  const omitted = [filters.includeTools === false ? "tools" : "", filters.includeFiles === false ? "files" : ""]
    .filter(Boolean)
    .join(", ");
  info(`Sending ~${formatTokens(tokens)} tokens (${mode}${omitted ? `, without ${omitted}` : ""}) to ${destination.label}.`);
  const result = await destination.send(context, { mode, filters });
  printSendResult(result);
}

/** Resolve content filters: explicit CLI flag > saved config > default. */
async function resolveFilters(options: ContentOptions, command: Command): Promise<RenderFilters> {
  const config = await readConfig();
  const fromFlag = (name: "tools" | "files"): boolean | undefined =>
    command.getOptionValueSource(name) === "cli" ? options[name] : undefined;

  return {
    includeTools: fromFlag("tools") ?? config.tools,
    includeFiles: fromFlag("files") ?? config.files,
    messageCount: parseMessageCount(options.messages) ?? config.messages
  };
}

function parseMessageCount(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UserError(`--messages expects a positive integer, got "${value}".`);
  }
  return parsed;
}

function printSetting(name: string, saved: boolean | number | undefined, fallback: boolean | number, description: string): void {
  const value = saved ?? fallback;
  const display = typeof value === "boolean" ? (value ? "on" : "off") : String(value);
  const origin = saved === undefined ? pc.dim(" (default)") : "";
  info(`  ${name.padEnd(8)} ${pc.bold(display)}${origin}  ${pc.dim(description)}`);
}


function resolveContextRef(idArg: string | undefined, last: boolean | undefined): string | undefined {
  if (idArg) {
    return idArg;
  }
  if (last) {
    return "last";
  }
  return undefined;
}

async function requireInteractiveDestination(): Promise<ContextDestination> {
  if (!isInteractive()) {
    const known = destinations.map((item) => item.id).join(", ");
    throw new UserError("Choose a destination.", `Example: \`ctx send claude-app --last\`. Available: ${known}.`);
  }
  return pickDestination();
}
