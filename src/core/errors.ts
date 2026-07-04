/** Error whose message is safe and useful to show directly to the user. */
export class UserError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "UserError";
    this.hint = hint;
  }
}

export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError;
}
