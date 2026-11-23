export class DanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DanError";
    this.code = code;
  }
}

export function isDanError(error: unknown): error is DanError {
  return error instanceof DanError;
}

export function asDanError(error: unknown): DanError {
  if (isDanError(error)) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new DanError("timeout", "The server took too long to answer.");
  }
  return new DanError("unreachable", "No Dan server answered at that address.");
}
