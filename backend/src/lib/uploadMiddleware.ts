import multer from "multer";

// Memory storage: every importer parses from a Buffer (mirrors the Python
// endpoints reading UploadFile.read() fully into memory before parsing).
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
