import { ImportParseError } from "./errors";

// pdfjs-dist ships ESM-only (no CJS build in 6.x — confirmed: package.json
// has `main: "build/pdf.mjs"` and no `exports` map). Under this project's
// `module: commonjs` tsconfig, `await import(...)` compiles to a
// Promise-wrapped `require(...)`, which only works because this project's
// Node runtime (24.x) supports synchronous `require()` of ESM modules —
// verified empirically before writing this file. If the Node runtime is
// ever downgraded below that support, this import will start throwing
// ERR_REQUIRE_ESM and needs revisiting.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

type PDFPageProxy = {
  getTextContent: () => Promise<{ items: Array<{ str: string; transform: number[] }> }>;
};
type PDFDocumentProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
};

/** Port of the shared PDF-open/password-handling block duplicated in
 * parse_cdsl_cas and parse_epf_statement. Preserves the exact sentinel
 * strings the frontend string-matches: PDF_PASSWORD_REQUIRED,
 * PDF_PASSWORD_INCORRECT, and the generic invalid-PDF message. */
export async function openPdf(bytes: Buffer, password?: string): Promise<PDFDocumentProxy> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      password,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    return (await loadingTask.promise) as PDFDocumentProxy;
  } catch (err: unknown) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      const marker =
        e.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? "PDF_PASSWORD_INCORRECT" : "PDF_PASSWORD_REQUIRED";
      throw new ImportParseError(marker);
    }
    throw new ImportParseError("This file doesn't appear to be a valid PDF — please check the file and try again.");
  }
}

/** Clusters a page's text items into rows (by y-coordinate proximity) and,
 * within each row, columns (by x-coordinate proximity), sorted into reading
 * order (top-to-bottom, left-to-right). Shared by extractText (which needs
 * line structure, not one flattened string) and extractTables (which needs
 * columns too). */
async function clusterRows(page: PDFPageProxy): Promise<string[][]> {
  const content = await page.getTextContent();
  const items = content.items;
  if (items.length === 0) return [];

  const Y_TOLERANCE = 3;
  const rows: Array<{ y: number; cells: Array<{ x: number; str: string }> }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x, str: item.str });
  }
  if (rows.length === 0) return [];

  rows.sort((a, b) => b.y - a.y); // PDF y-axis grows upward; reading order is top-to-bottom.
  return rows.map((r) => r.cells.sort((a, b) => a.x - b.x).map((c) => c.str.trim()));
}

/** Port of pdfplumber's page.extract_text() — joins text items in reading
 * order, one line per detected row (pdfplumber's extract_text() is
 * line-structured, not one flattened string — callers like EPF's
 * wrapped-establishment-name continuation logic depend on that structure). */
export async function extractText(page: PDFPageProxy): Promise<string> {
  const grid = await clusterRows(page);
  return grid.map((row) => row.join(" ")).join("\n");
}

/** Approximates pdfplumber's page.extract_tables(): clusters text items into
 * rows/columns (see clusterRows), then splits the row sequence into
 * multiple logical tables wherever a row matches the caller-supplied header
 * fingerprint. The split step matters — a CDSL CAS page frequently contains
 * both a folio table and a holding table, and a naive "one grid per page"
 * result would merge both headers into a single table, breaking CAS's
 * per-table routing. Callers with only one table per page (or none) can
 * omit `isTableHeader`. */
export async function extractTables(
  page: PDFPageProxy,
  isTableHeader: (row: string[]) => boolean = () => false,
): Promise<string[][][]> {
  const grid = await clusterRows(page);
  if (grid.length === 0) return [];

  const tables: string[][][] = [];
  let current: string[][] = [];
  for (const row of grid) {
    if (isTableHeader(row) && current.length > 0) {
      tables.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) tables.push(current);
  return tables;
}
