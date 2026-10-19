import { prisma } from "./db";
import { questionFingerprint, questionIdFromFingerprint, normaliseText } from "../questions/fingerprint";
import { validateQuestion, hasErrors, type SyllabusLookup, type ValidationIssue } from "../questions/validate";
import type { QuestionInput } from "../questions/types";
import type { ParsedImport } from "../questions/parsers";
import { createHash } from "node:crypto";

export interface ImportReport {
  total: number;
  created: number;
  duplicates: number;
  invalid: number;
  flagged: number;
  items: Array<{ index: number; id?: string; status: "created" | "duplicate" | "invalid"; issues: ValidationIssue[]; stem: string }>;
  unresolved: ParsedImport["unresolved"];
}

/**
 * Validates, de-duplicates and inserts questions. Idempotent: re-importing the same file creates nothing
 * new, because question ids are derived from content fingerprints.
 */
export async function importQuestions(
  parsed: ParsedImport,
  lookup: SyllabusLookup,
  meta: { fileName: string; format: string; importedBy?: string | null; expectedOptions?: number },
): Promise<ImportReport & { batchId: string }> {
  if (parsed.source) {
    const s = parsed.source;
    const data = { title: s.title, url: s.url, organization: s.organization, license: s.license, allowsRepublish: s.allowsRepublish ?? false, publishedAt: s.publishedAt ? new Date(s.publishedAt) : null, cycle: s.cycle, notes: s.notes };
    await prisma.source.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
  if (parsed.paper) {
    const p = parsed.paper;
    const data = { title: p.title, year: p.year, cycle: p.cycle, shift: p.shift, sourceId: p.sourceId ?? parsed.source?.id, isVerified: p.isVerified ?? false };
    await prisma.paperRecord.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }

  const report: ImportReport = { total: parsed.questions.length, created: 0, duplicates: 0, invalid: 0, flagged: 0, items: [], unresolved: parsed.unresolved };
  const fps = parsed.questions.map((q) => questionFingerprint(q));
  const existing = new Set((await prisma.question.findMany({ where: { fingerprint: { in: fps } }, select: { fingerprint: true } })).map((r) => r.fingerprint));
  // Near-duplicate signal: same normalised stem already in the bank with different options.
  const stemHash = (s: string) => createHash("sha1").update(normaliseText(s)).digest("hex");
  const topicIds = [...new Set(parsed.questions.map((q) => q.topicId))];
  const stemSet = new Set((await prisma.question.findMany({ where: { topicId: { in: topicIds } }, select: { stem: true } })).map((r) => stemHash(r.stem)));
  const seenInBatch = new Set<string>();
  const sourceIds = new Set((await prisma.source.findMany({ select: { id: true } })).map((s) => s.id));
  const paperIds = new Set((await prisma.paperRecord.findMany({ select: { id: true } })).map((p) => p.id));
  const toCreate: Array<QuestionInput & { id: string; fingerprint: string; qualityFlags: string[] }> = [];

  parsed.questions.forEach((q, index) => {
    const fp = fps[index];
    const issues = validateQuestion(q, lookup, meta.expectedOptions ?? 4);
    if (q.sourceId && !sourceIds.has(q.sourceId)) issues.push({ severity: "error", code: "SOURCE_UNKNOWN", message: `Unknown source ${q.sourceId}` });
    if (q.paperId && !paperIds.has(q.paperId)) issues.push({ severity: "error", code: "PAPER_UNKNOWN", message: `Unknown paper ${q.paperId}` });
    if (existing.has(fp) || seenInBatch.has(fp)) {
      report.duplicates++;
      report.items.push({ index, status: "duplicate", issues, stem: q.stem.slice(0, 120), id: questionIdFromFingerprint(fp) });
      return;
    }
    if (hasErrors(issues)) {
      report.invalid++;
      report.items.push({ index, status: "invalid", issues, stem: q.stem.slice(0, 120) });
      return;
    }
    seenInBatch.add(fp);
    const flags = issues.filter((i) => i.severity === "warning").map((i) => i.code);
    if (stemSet.has(stemHash(q.stem))) flags.push("POSSIBLE_DUPLICATE_STEM");
    stemSet.add(stemHash(q.stem));
    let status = q.verificationStatus;
    // A flagged question can never enter the bank as VERIFIED or PROVISIONAL without a look.
    if (flags.length && (status === "VERIFIED" || status === "PROVISIONAL") && q.verificationMethod !== "DETERMINISTIC_COMPUTATION") status = "PENDING_REVIEW";
    if (flags.length) report.flagged++;
    const id = questionIdFromFingerprint(fp);
    toCreate.push({ ...q, verificationStatus: status, id, fingerprint: fp, qualityFlags: flags });
    report.created++;
    report.items.push({ index, id, status: "created", issues, stem: q.stem.slice(0, 120) });
  });

  for (let i = 0; i < toCreate.length; i += 500) {
    await prisma.question.createMany({
      skipDuplicates: true,
      data: toCreate.slice(i, i + 500).map((q) => ({
        id: q.id,
        fingerprint: q.fingerprint,
        subjectId: q.subjectId,
        topicId: q.topicId,
        subtopicId: q.subtopicId ?? null,
        skillKey: q.skillKey,
        language: q.language,
        stem: q.stem,
        stemHi: q.stemHi ?? null,
        options: q.options as object[],
        correctOption: q.correctOption,
        explanation: q.explanation ?? null,
        explanationHi: q.explanationHi ?? null,
        difficulty: q.difficulty,
        difficultyBasis: q.difficultyBasis,
        requiredSkill: q.requiredSkill ?? null,
        expectedTimeSec: Math.round(q.expectedTimeSec),
        isNumerical: q.isNumerical ?? false,
        origin: q.origin,
        isSynthetic: q.isSynthetic,
        generator: q.generator ?? null,
        sourceId: q.sourceId ?? null,
        sourceRef: q.sourceRef ?? null,
        paperId: q.paperId ?? null,
        verificationStatus: q.verificationStatus,
        verificationMethod: q.verificationMethod,
        license: q.license ?? null,
        reviewNotes: q.reviewNotes ?? null,
        qualityFlags: q.qualityFlags,
      })),
    });
  }
  if (parsed.paper) {
    const count = await prisma.question.count({ where: { paperId: parsed.paper.id } });
    await prisma.paperRecord.update({ where: { id: parsed.paper.id }, data: { questionCount: count } });
  }
  const batch = await prisma.importBatch.create({
    data: {
      fileName: meta.fileName.slice(0, 200), format: meta.format, importedBy: meta.importedBy ?? null,
      totalRecords: report.total, created: report.created, duplicates: report.duplicates, invalid: report.invalid, flagged: report.flagged,
      report: { items: report.items.filter((i) => i.status !== "created" || i.issues.length).slice(0, 500), unresolved: report.unresolved.slice(0, 500) } as object,
    },
  });
  return { ...report, batchId: batch.id };
}
