import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";
import { UserError } from "./errors.js";
import { storeRoot } from "./store.js";

export const configSchema = z.object({
  /** Include tool activity in sent contexts. Default true. */
  tools: z.boolean().optional(),
  /** Include the relevant-files list in sent contexts. Default true. */
  files: z.boolean().optional(),
  /** Recent messages in the compact prompt. Default 8. */
  messages: z.number().int().positive().optional()
});

export type CtxConfig = z.infer<typeof configSchema>;

export const CONFIG_DEFAULTS = { tools: true, files: true, messages: 8 } as const;

export function configPath(): string {
  return path.join(storeRoot(), "config.json");
}

export async function readConfig(): Promise<CtxConfig> {
  if (!(await fs.pathExists(configPath()))) {
    return {};
  }
  const raw = await fs.readJson(configPath()).catch(() => ({}));
  const parsed = configSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export async function writeConfig(config: CtxConfig): Promise<void> {
  await fs.ensureDir(storeRoot());
  await fs.writeJson(configPath(), configSchema.parse(config), { spaces: 2 });
}

/** Flip a boolean setting (tools/files) and return its new value. */
export async function toggleConfigValue(key: "tools" | "files"): Promise<boolean> {
  const config = await readConfig();
  const next = !(config[key] ?? CONFIG_DEFAULTS[key]);
  config[key] = next;
  await writeConfig(config);
  return next;
}

export async function setConfigValue(key: string, rawValue: string): Promise<CtxConfig> {
  const config = await readConfig();

  if (key === "tools" || key === "files") {
    config[key] = parseBoolean(key, rawValue);
  } else if (key === "messages") {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new UserError(`"messages" expects a positive integer, got "${rawValue}".`);
    }
    config.messages = parsed;
  } else {
    throw new UserError(`Unknown setting "${key}".`, "Available settings: tools, files, messages.");
  }

  await writeConfig(config);
  return config;
}

function parseBoolean(key: string, rawValue: string): boolean {
  const value = rawValue.toLowerCase();
  if (["on", "true", "yes", "1"].includes(value)) {
    return true;
  }
  if (["off", "false", "no", "0"].includes(value)) {
    return false;
  }
  throw new UserError(`"${key}" expects on or off, got "${rawValue}".`);
}
