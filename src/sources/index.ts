import { UserError } from "../core/errors.js";
import { claudeCodeSource } from "./claude-code.js";
import { codexSource } from "./codex.js";
import { opencodeSource } from "./opencode.js";
import { piSource } from "./pi.js";
import type { ContextSource } from "./types.js";

export const sources: ContextSource[] = [codexSource, claudeCodeSource, opencodeSource, piSource];

export function findSource(idOrAlias: string): ContextSource {
  const normalized = idOrAlias.toLowerCase();
  const source = sources.find((item) => item.id === normalized || item.aliases.includes(normalized));
  if (!source) {
    const known = sources.map((item) => item.id).join(", ");
    throw new UserError(`Unknown source "${idOrAlias}".`, `Available sources: ${known}, file, stdin.`);
  }
  return source;
}
