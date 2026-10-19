/**
 * Admin operations: question review, syllabus versions, data-quality metrics and paper analysis.
 * Every mutation writes an AuditLog row; question status changes also write a ReviewEvent.
 */
import { z } from "zod";
import type { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "./db";
import { HttpError } from "./http";
import { getActiveConfig, lookupFromConfig } from "./syllabus";
import { questionFingerprint } from "../questions/fingerprint";
import { validateQuestion, hasErrors } from "../questions/validate";
import type { QuestionInput, QuestionOption } from "../questions/types";

export const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().min(3, "Give a reason for rejecting").max(1000) }),
  z.object({
    action: z.literal("edit"),
    note: z.string().max(1000).optional(),
    stem: z.string().min(5).max(2000),
    stemHi: z.string().max(2000).optional(),
    options: z.array(z.string().min(1).max(500)).min(2).max(6),
    correctOption: z.enum(["A", "B", "C", "D", "E", "F"]),
    explanation: z.string().max(4000).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    topicId: z.string().max(64),
  }),
]);
export type ReviewInput = z.infer<typeof reviewSchema>;

export async function reviewQuestion(adminId: string, questionId: string, input: ReviewInput) {
  const q = await prisma.question.findUnique({ where: { id: questionId } });
  if (!q) throw new HttpError(404, "Question not found");
  let to: VerificationStatus = q.verificationStatus;
  let data: Prisma.QuestionUpdateInput = {};
  if (input.action === "approve") {
    if (!q.correctOption) throw new HttpError(400, "A question without an answer cannot be approved.");
    to = "VERIFIED";
    data = { verificationStatus: to, verificationMethod: "HUMAN_REVIEW", lastReviewedAt: new Date(), reviewNotes: input.note ?? q.reviewNotes, qualityFlags: q.qualityFlags.filter((f) => f !== "POSSIBLE_DUPLICATE_STEM") };
  } else if (input.action === "reject") {
    to = "REJECTED";
    data = { verificationStatus: to, lastReviewedAt: new Date(), reviewNotes: input.note };
  } else {
    const { config } = await getActiveConfig();
    const lookup = lookupFromConfig(config);
    const oldOpts = q.options as unknown as QuestionOption[];
    const options: QuestionOption[] = input.options.map((text, i) => ({ ...(oldOpts[i] ?? {}), key: (["A", "B", "C", "D", "E", "F"] as const)[i], text }));
    const draft: QuestionInput = {
      subjectId: lookup.subjectOfTopic(input.topicId) ?? "", topicId: input.topicId, subtopicId: input.topicId === q.topicId ? q.subtopicId : null, skillKey: q.skillKey,
      language: q.language, stem: input.stem, stemHi: input.stemHi || null, options, correctOption: input.correctOption, explanation: input.explanation || null,
      difficulty: input.difficulty, difficultyBasis: q.difficultyBasis, expectedTimeSec: q.expectedTimeSec, origin: q.origin, isSynthetic: q.isSynthetic,
      verificationStatus: "PENDING_REVIEW", verificationMethod: "NONE",
    };
    const issues = validateQuestion(draft, lookup, options.length);
    if (hasErrors(issues)) throw new HttpError(400, issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
    const fingerprint = questionFingerprint(draft);
    const clash = await prisma.question.findFirst({ where: { fingerprint, NOT: { id: q.id } }, select: { id: true } });
    if (clash) throw new HttpError(409, "An identical question already exists in the bank.");
    // An edit sends the question back to the queue; it needs a separate approval.
    to = "PENDING_REVIEW";
    data = {
      fingerprint, stem: draft.stem, stemHi: draft.stemHi, options: options as unknown as Prisma.InputJsonValue, correctOption: draft.correctOption,
      explanation: draft.explanation, difficulty: draft.difficulty, verificationStatus: to, verificationMethod: "NONE",
      topic: { connect: { id: draft.topicId } }, subject: { connect: { id: draft.subjectId } },
      subtopic: draft.subtopicId ? { connect: { id: draft.subtopicId } } : { disconnect: true },
      reviewNotes: input.note ?? q.reviewNotes, lastReviewedAt: new Date(),
    };
  }
  await prisma.$transaction([
    prisma.question.update({ where: { id: q.id }, data }),
    prisma.reviewEvent.create({ data: { questionId: q.id, reviewerId: adminId, fromStatus: q.verificationStatus, toStatus: to, note: input.note ?? (input.action === "edit" ? "Edited" : null) } }),
    prisma.auditLog.create({ data: { userId: adminId, action: `QUESTION_${input.action.toUpperCase()}`, target: q.id, detail: { from: q.verificationStatus, to } } }),
  ]);
  return { id: q.id, from: q.verificationStatus, to };
}

export async function activateSyllabusVersion(adminId: string, versionId: string) {
  const v = await prisma.syllabusVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new HttpError(404, "Version not found");
  await prisma.$transaction([
    prisma.syllabusVersion.updateMany({ where: { examId: v.examId }, data: { isActive: false } }),
    prisma.syllabusVersion.update({ where: { id: v.id }, data: { isActive: true } }),
    prisma.auditLog.create({ data: { userId: adminId, action: "SYLLABUS_ACTIVATE", target: v.id, detail: { version: v.version } } }),
  ]);
}

/** Aggregate data-quality metrics. Contains no per-student data. */
export async function dataQuality() {
  const { config, version } = await getActiveConfig();
  const [byStatus, byOrigin, byTopicStatus, noHindi, noExplanation, flagged, sources, papers, batches, calib] = await Promise.all([
    prisma.question.groupBy({ by: ["verificationStatus"], _count: true }),
    prisma.question.groupBy({ by: ["origin", "verificationStatus"], _count: true }),
    prisma.question.groupBy({ by: ["topicId", "verificationStatus", "difficulty"], _count: true }),
    prisma.question.count({ where: { stemHi: null, verificationStatus: { not: "REJECTED" } } }),
    prisma.question.count({ where: { explanation: null, verificationStatus: { not: "REJECTED" } } }),
    prisma.question.findMany({ where: { qualityFlags: { isEmpty: false } }, select: { qualityFlags: true } }),
    prisma.source.findMany({ select: { id: true, title: true, url: true, license: true, allowsRepublish: true, notes: true } }),
    prisma.paperRecord.findMany({ select: { id: true, title: true, year: true, isVerified: true, questionCount: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.question.findMany({ where: { observedAttempts: { gte: 20 } }, select: { id: true, difficulty: true, observedPValue: true, observedAttempts: true } }),
  ]);
  const flagCounts: Record<string, number> = {};
  for (const f of flagged) for (const x of f.qualityFlags) flagCounts[x] = (flagCounts[x] ?? 0) + 1;

  const fullMockNeed = new Map<string, number>();
  for (const s of config.syllabus) {
    const sec = config.sections.find((x) => x.subjectId === s.id);
    const totalW = s.topics.reduce((a, t) => a + t.weight, 0) || 1;
    for (const t of s.topics) fullMockNeed.set(t.id, Math.max(1, Math.round(((sec?.questions ?? 0) * t.weight) / totalW)));
  }
  const topics = config.syllabus.flatMap((s) =>
    s.topics.map((t) => {
      const rows = byTopicStatus.filter((r) => r.topicId === t.id);
      const eligible = rows.filter((r) => r.verificationStatus === "VERIFIED" || r.verificationStatus === "PROVISIONAL").reduce((a, r) => a + r._count, 0);
      const verified = rows.filter((r) => r.verificationStatus === "VERIFIED").reduce((a, r) => a + r._count, 0);
      const pending = rows.filter((r) => r.verificationStatus === "PENDING_REVIEW").reduce((a, r) => a + r._count, 0);
      const diff = (d: string) => rows.filter((r) => r.difficulty === d && r.verificationStatus !== "REJECTED" && r.verificationStatus !== "PENDING_REVIEW").reduce((a, r) => a + r._count, 0);
      const need = fullMockNeed.get(t.id) ?? 1;
      return { topicId: t.id, name: t.name, subjectId: s.id, eligible, verified, pending, easy: diff("EASY"), medium: diff("MEDIUM"), hard: diff("HARD"), perFullMock: need, fullMocksBeforeRepeat: Math.floor(eligible / need) };
    }),
  );
  // Calibration: stated difficulty versus observed share correct (only with ≥ 20 attempts).
  const miscalibrated = calib.filter((c) => c.observedPValue !== null && ((c.difficulty === "EASY" && c.observedPValue < 0.4) || (c.difficulty === "HARD" && c.observedPValue > 0.85)));
  return {
    version,
    verification: config.verification,
    conflicts: config.conflicts,
    totals: Object.fromEntries(byStatus.map((r) => [r.verificationStatus, r._count])) as Record<string, number>,
    byOrigin: byOrigin.map((r) => ({ origin: r.origin, status: r.verificationStatus, count: r._count })),
    noHindi, noExplanation, flagCounts, topics, sources, papers,
    batches: batches.map((b) => ({ id: b.id, fileName: b.fileName, format: b.format, createdAt: b.createdAt, total: b.totalRecords, created: b.created, duplicates: b.duplicates, invalid: b.invalid, flagged: b.flagged })),
    calibration: { questionsWithEnoughData: calib.length, miscalibrated: miscalibrated.length },
  };
}

/**
 * Previous-year paper analysis. Only papers marked verified count, and the output states the sample
 * size so a distribution built from one or two papers is not read as a reliable trend.
 */
export async function paperAnalysis() {
  const { config } = await getActiveConfig();
  const papers = await prisma.paperRecord.findMany({ orderBy: [{ year: "desc" }] });
  const verified = papers.filter((p) => p.isVerified);
  const rows = verified.length
    ? await prisma.question.groupBy({ by: ["paperId", "topicId", "difficulty"], where: { paperId: { in: verified.map((p) => p.id) }, verificationStatus: { not: "REJECTED" } }, _count: true })
    : [];
  const total = rows.reduce((a, r) => a + r._count, 0);
  const topicTotals = new Map<string, number>();
  const diffTotals: Record<string, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const r of rows) {
    topicTotals.set(r.topicId, (topicTotals.get(r.topicId) ?? 0) + r._count);
    diffTotals[r.difficulty] += r._count;
  }
  const topics = config.syllabus.flatMap((s) => {
    const sumW = s.topics.reduce((a, t) => a + t.weight, 0) || 1;
    const sec = config.sections.find((x) => x.subjectId === s.id)?.questions ?? 0;
    return s.topics.map((t) => ({
      topicId: t.id, name: t.name, subject: s.name,
      configShare: (sec * t.weight) / sumW / config.pattern.totalQuestions,
      observed: topicTotals.get(t.id) ?? 0,
      observedShare: total ? (topicTotals.get(t.id) ?? 0) / total : null,
    }));
  });
  const reliability =
    verified.length === 0 ? "No verified previous-year papers are loaded, so topic weights come from the syllabus configuration only."
    : verified.length < 3 ? `Only ${verified.length} verified paper(s); treat observed shares as indicative, not as a trend.`
    : `${verified.length} verified papers.`;
  return { papers: papers.map((p) => ({ id: p.id, title: p.title, year: p.year, isVerified: p.isVerified, questionCount: p.questionCount })), verifiedCount: verified.length, totalQuestions: total, difficulty: diffTotals, topics, reliability };
}

export async function setPaperVerified(adminId: string, paperId: string, isVerified: boolean) {
  const p = await prisma.paperRecord.findUnique({ where: { id: paperId } });
  if (!p) throw new HttpError(404, "Paper not found");
  await prisma.$transaction([
    prisma.paperRecord.update({ where: { id: paperId }, data: { isVerified } }),
    prisma.auditLog.create({ data: { userId: adminId, action: isVerified ? "PAPER_VERIFY" : "PAPER_UNVERIFY", target: paperId } }),
  ]);
}
