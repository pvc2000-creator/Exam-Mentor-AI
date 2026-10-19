/**
 * Upload checks shared by the admin import page and the CLI importer: size limit, extension and
 * content (magic bytes) must agree, then the file is parsed into question drafts.
 */
import { HttpError } from "./http";
import { parseCsvImport, parseJsonImport, parsePdfText, type ParsedImport } from "../questions/parsers";

export type UploadFormat = "csv" | "json" | "pdf";

export function maxUploadBytes() {
  const n = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * 1024;
}

/** Returns the format only when the file name and its bytes agree. */
export function detectFormat(fileName: string, buf: Uint8Array): UploadFormat {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const head = Buffer.from(buf.subarray(0, 8)).toString("latin1");
  const isPdf = head.startsWith("%PDF-");
  const sample = Buffer.from(buf.subarray(0, 4096));
  const looksText = !sample.includes(0) && !isPdf;
  if (ext === "pdf") {
    if (!isPdf) throw new HttpError(415, "The file has a .pdf name but is not a PDF.");
    return "pdf";
  }
  if (ext === "json") {
    const first = sample.toString("utf8").replace(/^﻿/, "").trimStart()[0];
    if (!looksText || (first !== "{" && first !== "[")) throw new HttpError(415, "The file has a .json name but does not contain JSON.");
    return "json";
  }
  if (ext === "csv") {
    if (!looksText) throw new HttpError(415, "The file has a .csv name but is not a text file.");
    return "csv";
  }
  throw new HttpError(415, "Only .csv, .json and .pdf files are accepted.");
}

export async function pdfToText(buf: Buffer): Promise<string> {
  // Import the library entry directly; the package index runs a self-test that reads a fixture file.
  const { default: pdf } = await import("pdf-parse/lib/pdf-parse.js");
  const out = await pdf(buf, { max: 200 });
  return out.text;
}

export async function parseUpload(
  fileName: string,
  buf: Buffer,
  subjectOfTopic: (t: string) => string | undefined,
  opts: { fallbackTopicId?: string } = {},
): Promise<{ format: UploadFormat; parsed: ParsedImport }> {
  if (buf.byteLength > maxUploadBytes()) throw new HttpError(413, `File is larger than ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  if (buf.byteLength === 0) throw new HttpError(400, "The file is empty.");
  const format = detectFormat(fileName, buf);
  let parsed: ParsedImport;
  try {
    if (format === "csv") parsed = parseCsvImport(buf.toString("utf8"), subjectOfTopic);
    else if (format === "json") parsed = parseJsonImport(buf.toString("utf8"), subjectOfTopic);
    else {
      if (!opts.fallbackTopicId) throw new HttpError(400, "Choose a topic for questions extracted from a PDF.");
      parsed = parsePdfText(await pdfToText(buf), opts.fallbackTopicId, subjectOfTopic);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, `Could not read the file: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}`);
  }
  // Uploaded material always enters the review queue, and an uploaded paper starts unverified.
  for (const q of parsed.questions) {
    q.verificationStatus = "PENDING_REVIEW";
    q.verificationMethod = "NONE";
  }
  if (parsed.paper) parsed.paper.isVerified = false;
  return { format, parsed };
}
