/**
 * File parsers for the import pipeline. Each returns canonical QuestionInput drafts plus notes about
 * anything that could not be extracted reliably. Nothing here invents missing answers.
 */
import { z } from "zod";
import type { OptionKey, QuestionInput } from "./types";

export interface ParsedImport {
  questions: QuestionInput[];
  paper?: { id: string; title: string; year: number; cycle: string; shift?: string; sourceId?: string; isVerified?: boolean };
  source?: { id: string; title: string; url?: string; organization?: string; license: string; allowsRepublish?: boolean; publishedAt?: string; cycle?: string; notes?: string };
  /** Items that could not become questions (e.g. PDF items without an answer key). */
  unresolved: Array<{ ref: string; reason: string; text: string }>;
}

const KEYS: OptionKey[] = ["A", "B", "C", "D", "E", "F"];

/** RFC 4180-style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const originEnum = z.enum(["OFFICIAL_PREVIOUS_YEAR", "SOURCE_MATERIAL", "SYNTHETIC_TEMPLATE", "AI_AUTHORED", "HUMAN_AUTHORED"]);
const diffEnum = z.enum(["EASY", "MEDIUM", "HARD"]);

const rowSchema = z.object({
  subject_id: z.string().optional().default(""),
  topic_id: z.string().min(1, "topic_id is required"),
  subtopic_id: z.string().optional().default(""),
  skill_key: z.string().optional().default(""),
  language: z.enum(["EN", "HI"]).optional().default("EN"),
  stem: z.string().default(""),
  stem_hi: z.string().optional().default(""),
  option_a: z.string().default(""), option_b: z.string().default(""), option_c: z.string().optional().default(""), option_d: z.string().optional().default(""),
  option_a_hi: z.string().optional().default(""), option_b_hi: z.string().optional().default(""), option_c_hi: z.string().optional().default(""), option_d_hi: z.string().optional().default(""),
  correct_option: z.string().optional().default(""),
  explanation: z.string().optional().default(""),
  explanation_hi: z.string().optional().default(""),
  difficulty: diffEnum.optional().default("MEDIUM"),
  difficulty_basis: z.string().optional().default(""),
  expected_time_sec: z.coerce.number().optional().default(40),
  origin: originEnum.optional().default("HUMAN_AUTHORED"),
  is_synthetic: z.string().optional().default(""),
  source_id: z.string().optional().default(""),
  source_ref: z.string().optional().default(""),
  paper_id: z.string().optional().default(""),
  license: z.string().optional().default(""),
});

export function rowToQuestion(r: z.infer<typeof rowSchema>, subjectOfTopic: (t: string) => string | undefined): QuestionInput {
  const opts = [r.option_a, r.option_b, r.option_c, r.option_d];
  const optsHi = [r.option_a_hi, r.option_b_hi, r.option_c_hi, r.option_d_hi];
  const options = opts
    .map((text, i) => ({ key: KEYS[i], text: text.trim(), ...(optsHi[i]?.trim() ? { textHi: optsHi[i].trim() } : {}) }))
    .filter((o) => o.text !== "");
  const official = r.origin === "OFFICIAL_PREVIOUS_YEAR";
  return {
    subjectId: r.subject_id || subjectOfTopic(r.topic_id) || "",
    topicId: r.topic_id,
    subtopicId: r.subtopic_id || null,
    skillKey: r.skill_key || r.subtopic_id || r.topic_id,
    language: r.language,
    stem: r.stem.trim(),
    stemHi: r.stem_hi.trim() || null,
    options,
    correctOption: r.correct_option.trim().toUpperCase(),
    explanation: r.explanation.trim() || null,
    explanationHi: r.explanation_hi.trim() || null,
    difficulty: r.difficulty,
    difficultyBasis: r.difficulty_basis || "Imported; difficulty as supplied, to be calibrated from observed performance",
    expectedTimeSec: r.expected_time_sec,
    isNumerical: /\d/.test(options.map((o) => o.text).join("")) && options.every((o) => /^[\d.,\s₹%a-z/°-]+$/i.test(o.text)),
    origin: r.origin,
    isSynthetic: official ? false : r.is_synthetic.toLowerCase() === "true",
    sourceId: r.source_id || null,
    sourceRef: r.source_ref || null,
    paperId: r.paper_id || null,
    license: r.license || null,
    // Uploaded material always starts in the review queue; an admin approves it.
    verificationStatus: "PENDING_REVIEW",
    verificationMethod: "NONE",
  };
}

export function parseCsvImport(text: string, subjectOfTopic: (t: string) => string | undefined): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { questions: [], unresolved: [{ ref: "file", reason: "CSV has no data rows", text: "" }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const questions: QuestionInput[] = [];
  const unresolved: ParsedImport["unresolved"] = [];
  rows.slice(1).forEach((cells, idx) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    const parsed = rowSchema.safeParse(obj);
    if (!parsed.success) {
      unresolved.push({ ref: `row ${idx + 2}`, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), text: (obj.stem ?? "").slice(0, 120) });
      return;
    }
    questions.push(rowToQuestion(parsed.data, subjectOfTopic));
  });
  return { questions, unresolved };
}

const jsonSchema = z.object({
  paper: z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: z.string(), year: z.number().int(), cycle: z.string(), shift: z.string().optional(), sourceId: z.string().optional(), isVerified: z.boolean().optional() }).optional(),
  source: z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: z.string(), url: z.string().url().optional(), organization: z.string().optional(), license: z.string(), allowsRepublish: z.boolean().optional(), publishedAt: z.string().optional(), cycle: z.string().optional(), notes: z.string().optional() }).optional(),
  questions: z.array(z.record(z.any())).max(5000),
});

export function parseJsonImport(text: string, subjectOfTopic: (t: string) => string | undefined): ParsedImport {
  const data = jsonSchema.parse(JSON.parse(text));
  const unresolved: ParsedImport["unresolved"] = [];
  const questions: QuestionInput[] = [];
  data.questions.forEach((raw, idx) => {
    // Accept either flat CSV-style keys or {options: [..]} arrays.
    const flat: Record<string, unknown> = { ...raw };
    if (Array.isArray(raw.options)) {
      (raw.options as unknown[]).forEach((o, i) => {
        const k = ["a", "b", "c", "d"][i];
        if (!k) return;
        if (typeof o === "string") flat[`option_${k}`] = o;
        else if (o && typeof o === "object") {
          flat[`option_${k}`] = (o as { text?: string }).text ?? "";
          flat[`option_${k}_hi`] = (o as { textHi?: string }).textHi ?? "";
        }
      });
    }
    if (!flat.paper_id && data.paper) flat.paper_id = data.paper.id;
    if (!flat.source_id && (data.source || data.paper?.sourceId)) flat.source_id = data.source?.id ?? data.paper?.sourceId;
    const strings = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v == null ? "" : String(v)]));
    const parsed = rowSchema.safeParse(strings);
    if (!parsed.success) {
      unresolved.push({ ref: `item ${idx + 1}`, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), text: String(raw.stem ?? "").slice(0, 120) });
      return;
    }
    questions.push(rowToQuestion(parsed.data, subjectOfTopic));
  });
  return { questions, paper: data.paper, source: data.source, unresolved };
}

/**
 * Heuristic extraction of numbered MCQs from PDF text, e.g.
 *   12. Question text
 *   (A) ... (B) ... (C) ... (D) ...
 *   Answer: C            ← optional, or an answer key "12-C" / "12. C" after a line "Answer Key"
 * Extracted questions have no topic mapping; the importer assigns `fallbackTopicId` and marks every
 * item for review. Items without an answer are returned as unresolved.
 */
export function parsePdfText(text: string, fallbackTopicId: string, subjectOfTopic: (t: string) => string | undefined): ParsedImport {
  const unresolved: ParsedImport["unresolved"] = [];
  const questions: QuestionInput[] = [];
  const normalised = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const keyMatch = normalised.split(/answer\s*key|उत्तर\s*कुंजी/i);
  const body = keyMatch[0];
  const key = new Map<number, string>();
  if (keyMatch[1]) for (const m of keyMatch[1].matchAll(/(\d{1,3})\s*[-.):]\s*\(?([A-Da-d])\)?/g)) key.set(Number(m[1]), m[2].toUpperCase());
  const blocks = body.split(/\n(?=\s*(?:Q\.?\s*)?\d{1,3}[.)]\s)/);
  for (const block of blocks) {
    const head = block.match(/^\s*(?:Q\.?\s*)?(\d{1,3})[.)]\s([\s\S]*)$/);
    if (!head) continue;
    const num = Number(head[1]);
    const rest = head[2];
    const optRe = /\(?([A-Da-d])[).]\s*([^\n(]+?)(?=\s*\(?[A-Da-d][).]\s|\n|$)/g;
    const firstOpt = rest.search(/\(?[Aa][).]\s/);
    if (firstOpt < 0) { unresolved.push({ ref: `Q${num}`, reason: "Options not found", text: rest.slice(0, 120) }); continue; }
    const stem = rest.slice(0, firstOpt).replace(/\s+/g, " ").trim();
    const opts: Array<{ key: OptionKey; text: string }> = [];
    for (const m of rest.slice(firstOpt).matchAll(optRe)) opts.push({ key: m[1].toUpperCase() as OptionKey, text: m[2].trim() });
    const inline = rest.match(/(?:Answer|Ans|उत्तर)\s*[:.-]\s*\(?([A-Da-d])\)?/i);
    const answer = inline?.[1]?.toUpperCase() ?? key.get(num);
    if (opts.length < 2) { unresolved.push({ ref: `Q${num}`, reason: "Fewer than two options extracted", text: stem.slice(0, 120) }); continue; }
    if (!answer) { unresolved.push({ ref: `Q${num}`, reason: "No answer found (supply an official answer key)", text: stem.slice(0, 120) }); continue; }
    questions.push({
      subjectId: subjectOfTopic(fallbackTopicId) ?? "",
      topicId: fallbackTopicId,
      subtopicId: null,
      skillKey: `${fallbackTopicId}.unmapped`,
      language: /[ऀ-ॿ]/.test(stem) ? "HI" : "EN",
      stem,
      options: opts,
      correctOption: answer,
      explanation: null,
      difficulty: "MEDIUM",
      difficultyBasis: "Unknown at extraction; to be calibrated",
      expectedTimeSec: 40,
      origin: "SOURCE_MATERIAL",
      isSynthetic: false,
      sourceRef: `Q${num}`,
      verificationStatus: "PENDING_REVIEW",
      verificationMethod: "NONE",
      reviewNotes: "Extracted automatically from PDF; check text, options, topic mapping and answer.",
    });
  }
  return { questions, unresolved };
}
