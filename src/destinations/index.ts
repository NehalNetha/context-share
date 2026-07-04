import { UserError } from "../core/errors.js";
import { claudeCliDestination } from "./claude-cli.js";
import { clipboardDestination, stdoutDestination } from "./clipboard.js";
import { codexCliDestination } from "./codex-cli.js";
import type { ContextDestination } from "./types.js";

export const destinations: ContextDestination[] = [
  claudeCliDestination,
  codexCliDestination,
  clipboardDestination,
  stdoutDestination
];

export function findDestination(idOrAlias: string): ContextDestination {
  const normalized = idOrAlias.toLowerCase();
  const destination = destinations.find(
    (item) => item.id === normalized || item.aliases.includes(normalized)
  );
  if (!destination) {
    const known = destinations.map((item) => item.id).join(", ");
    throw new UserError(`Unknown destination "${idOrAlias}".`, `Available destinations: ${known}.`);
  }
  return destination;
}
