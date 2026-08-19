type ErrorCode =
  | "invalid-argument"
  | "failed-precondition"
  | "permission-denied"
  | "not-found"
  | "already-exists"
  | "resource-exhausted"
  | "unauthenticated"
  | "internal";

const STATUS_MAP: Record<ErrorCode, number> = {
  "invalid-argument": 400,
  "failed-precondition": 400,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  "resource-exhausted": 429,
  "unauthenticated": 401,
  "internal": 500,
};

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse() {
    return Response.json(
      { error: { code: this.code, message: this.message } },
      { status: STATUS_MAP[this.code] },
    );
  }
}
