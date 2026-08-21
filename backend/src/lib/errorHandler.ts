import type { ErrorRequestHandler } from "express";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  RequestValidationError,
  ConfigurationError,
  RateLimitError,
  ProviderError,
} from "./errors";
import { logger } from "./logger";

// Mirrors the FastAPI routers' NotFoundError->404 / ConflictError->409 /
// ValidationError->400 exception handling, plus app/core/exceptions.py's
// ConfigurationError->400 / RateLimitError->429 / ProviderError->502
// (checked most-specific-subclass-first, since ConfigurationError and
// RateLimitError both extend ProviderError). RequestValidationError->422
// mirrors FastAPI/pydantic's request-shape validation status, kept distinct
// from the business-rule ValidationError->400 above it.
// Express only recognizes error middleware with this exact 4-argument arity.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ detail: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ detail: err.message });
    return;
  }
  if (err instanceof ConfigurationError) {
    res.status(400).json({ detail: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ detail: err.message });
    return;
  }
  if (err instanceof RequestValidationError) {
    res.status(422).json({ detail: err.message });
    return;
  }
  if (err instanceof RateLimitError) {
    res.status(429).json({ detail: err.message });
    return;
  }
  if (err instanceof ProviderError) {
    res.status(502).json({ detail: err.message });
    return;
  }
  logger.error(err);
  res.status(500).json({ detail: "Internal server error" });
};
