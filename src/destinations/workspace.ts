import fs from "fs-extra";
import type { PortableContext } from "../core/schema.js";

export type LaunchCwd = {
  cwd: string;
  note?: string;
};

/** Prefer the workspace recorded in the context; fall back to the current directory. */
export async function resolveLaunchCwd(context: PortableContext): Promise<LaunchCwd> {
  if (context.workspace) {
    const stat = await fs.stat(context.workspace).catch(() => undefined);
    if (stat?.isDirectory()) {
      return { cwd: context.workspace };
    }
    return {
      cwd: process.cwd(),
      note: `Workspace not found (${context.workspace}); using current folder instead.`
    };
  }
  return {
    cwd: process.cwd(),
    note: "No workspace recorded for this context; using current folder."
  };
}
