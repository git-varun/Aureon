import { ValidationError } from "../errors";

/** Raised by any importer on unparseable input. Routes catch this the same
 * way they catch ValidationError (see errorHandler.ts) -> 400. Kept as a
 * distinct class only so importer call sites can narrow their catches if
 * they ever need to (e.g. distinguishing a parse failure from a downstream
 * DB/business-rule failure), matching Python's importer functions raising
 * plain ValueError/ImportError re-wrapped as ValidationError by the caller. */
export class ImportParseError extends ValidationError {}
