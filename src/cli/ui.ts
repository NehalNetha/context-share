import pc from "picocolors";
import prompts from "prompts";
import { UserError } from "../core/errors.js";
import type { SendResult } from "../destinations/types.js";
import { relativeTime } from "../core/text.js";

type Choice<T> = {
  title: string;
  value: T;
  description?: string;
};

export async function select<T>(message: string, choices: Choice<T>[]): Promise<T> {
  const answer = await prompts(
    { type: "select", name: "value", message, choices },
    { onCancel: () => { throw new UserError("Cancelled."); } }
  );
  return answer.value as T;
}

export async function askNumber(message: string, initial: number): Promise<number> {
  const answer = await prompts(
    { type: "number", name: "value", message, initial, min: 1 },
    { onCancel: () => { throw new UserError("Cancelled."); } }
  );
  return answer.value as number;
}

type ToggleChoice<T> = Choice<T> & { selected?: boolean };

export async function multiselect<T>(message: string, choices: ToggleChoice<T>[]): Promise<T[]> {
  const answer = await prompts(
    {
      type: "multiselect",
      name: "value",
      message,
      choices,
      instructions: false,
      hint: "space to toggle · enter to confirm"
    },
    { onCancel: () => { throw new UserError("Cancelled."); } }
  );
  return (answer.value ?? []) as T[];
}

export function success(message: string): void {
  console.log(pc.green(message));
}

export function info(message: string): void {
  console.log(message);
}

export function warn(message: string): void {
  console.log(pc.yellow(message));
}

export function printSendResult(result: SendResult): void {
  for (const message of result.messages) {
    success(message);
  }
}

export function formatWhen(iso: string): string {
  return iso ? `${relativeTime(iso)}` : "unknown time";
}

export function printError(error: unknown): void {
  if (error instanceof UserError) {
    console.error(pc.red(error.message));
    if (error.hint) {
      console.error(pc.dim(error.hint));
    }
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`Unexpected error: ${message}`));
  if (process.env.CTX_DEBUG && error instanceof Error && error.stack) {
    console.error(pc.dim(error.stack));
  } else {
    console.error(pc.dim("Set CTX_DEBUG=1 for a stack trace."));
  }
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
