import { RequestValidationError } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards a route's :id param before it reaches Prisma. Without this, a
 * malformed UUID hits Postgres as raw input, throws an unhandled
 * PrismaClientKnownRequestError, and falls through to errorHandler's generic
 * 500 — where FastAPI's `uuid.UUID`-typed path params 422 instead (confirmed
 * live against the Python backend). */
export function requireUuidParam(value: string, paramName: string): void {
  if (!UUID_RE.test(value)) {
    throw new RequestValidationError(`${paramName} must be a valid UUID`);
  }
}

/** Guards a route's required (FastAPI `Query(...)`) query param before it's
 * treated as data. An *absent* param (Express gives `undefined`) must 422,
 * same as FastAPI's required Query param — but a *present, empty-string*
 * param (`?q=`) is valid input and must NOT be rejected here, since Python's
 * `Query(...)` only requires the param to exist, not be non-empty. Returns
 * the value narrowed to `string` so callers don't need their own `?? ""`. */
export function requireQueryParam(value: unknown, paramName: string): string {
  if (value === undefined) {
    throw new RequestValidationError(`${paramName} is required`);
  }
  return String(value);
}
