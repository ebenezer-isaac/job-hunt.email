export class AIFailureError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
    public readonly retries?: number,
  ) {
    super(message);
    this.name = "AIFailureError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
