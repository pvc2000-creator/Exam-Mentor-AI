/**
 * Mock generation, timed attempts, answer persistence and submission.
 * Every function takes the authenticated userId and scopes all queries to it (no IDOR).
 */
import { z } from "zod";
import type { MockType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { HttpError } from "./http";
import { getActiveConfig } from "./syllabus";
import { recomputeProfile, loadEvents } from "./profile";
import { allocateMock, type MockTypeT, type TopicProfile } from "../engine/allocation";
import { selectQuestions, type CandidateQuestion, type Exposure } from "../engine/selection";
import { DEFAULT_POLICY, type LearningPolicy } from "../engine/policy";
import { scoreItems, clampTime } from "../engine/scoring";
import { classifyError, summariseErrorPatterns, type ErrorCategoryT } from "../engine/errors";
import { quantile, type MasteryStateT } from "../engine/mastery";
import { hashString } from "../rng";
import type { QuestionOption } from "../questions/types";
import type { ExamConfig } from "../exam-config";

export const GRACE_MS = 15_000; // network grace after the deadline

export const createMockSchema = z.object({
  type: z.enum(["FULL_LENGTH", "SUBJECT", "TOPIC_PRACTICE", "ADAPTIVE_WEAKNESS", "SPEED_DRILL", "REVISION", "MIXED", "DIAGNOSTIC"]),
  subjectId: z.string().max(64).optional(),
  topicId: z.string().max(64).optional(),
  questionCount: z.number().int().min(5).max(200).optional(),
  durationMinutes: z.number().int().min(1).max(240).optional(),
  feedbackMode: z.enum(["IMMEDIATE", "END_OF_SET"]).optional(),
  seed: z.number().int().optional(),
});
export type CreateMockInput = z.infer<typeof createMockSchema>;

const TYPE_TITLES: Record<MockTypeT, string> = {
  FULL_LENGTH: "Full-length exam simulation",
  SUBJECT: "Subject mock",
  TOPIC_PRACTICE: "Topic practice",
  ADAPTIVE_WEAKNESS: "Personalised weakness mock",
  SPEED_DRILL: "Speed and accuracy drill",
  REVISION: "Revision mock",
  MIXED: "Mixed-syllabus mock",
  DIAGNOSTIC: "Diagnostic baseline test",
};

const DEFAULT_COUNTS: Record<MockTypeT, number> = { FULL_LENGTH: 100, SUBJECT: 25, TOPIC_PRACTICE: 10, ADAPTIVE_WEAKNESS: 30, SPEED_DRILL: 15, REVISION: 20, MIXED: 30, DIAGNOSTIC: 30 };

export function allowProvisional() {
  return (process.env.ALLOW_PROVISIONAL_QUESTIONS ?? "true") !== "false";
}

function eligibleStatuses(): Prisma.QuestionWhereInput["verificationStatus"] {
  return allowProvisional() ? { in: ["VERIFIED", "PROVISIONAL"] } : "VERIFIED";
}

/** Resolve duration so that question count, time and marking stay consistent with the exam pattern. */
export function resolveTiming(cfg: ExamConfig, type: MockTypeT, count: number, durationMinutes?: number) {
  const perQuestionSec = (cfg.pattern.durationMinutes * 60) / cfg.pattern.totalQuestions; // 72 s for 100 Q / 120 min
  if (type === "FULL_LENGTH") return cfg.pattern.durationMinutes * 60;
  if (durationMinutes) return durationMinutes * 60;
  const factor = type === "SPEED_DRILL" ? 0.6 : type === "TOPIC_PRACTICE" ? 1.5 : 1;
  return Math.max(60, Math.round((count * perQuestionSec * factor) / 60) * 60);
}

async function topicProfiles(userId: string) {
  const [states, patterns] = await Promise.all([
    prisma.studentSkillState.findMany({ where: { userId, level: "TOPIC" } }),
    prisma.response.groupBy({ by: ["topicId"], where: { userId, scored: true, errorCategory: "RUSHED", errorConfidence: { gte: 0.5 } }, _count: true }),
  ]);
  const rushed = new Map(patterns.map((p) => [p.topicId, p._count]));
  return new Map<string, TopicProfile>(
    states.map((s) => [s.nodeId, {
      topicId: s.nodeId, state: s.state as MasteryStateT, masteryScore: s.masteryScore, confidence: s.confidence, attempts: s.attempts,
      repeatedMistakes: s.repeatedMistakes, slowShare: s.slowShare, rushedCount: rushed.get(s.nodeId) ?? 0, trend: s.trend, retentionDueAt: s.retentionDueAt, recentAccuracy: s.recentAccuracy,
    }]),
  );
}

async function exposureFor(userId: string) {
  const rows = await prisma.response.findMany({
    where: { userId, scored: true },
    select: { questionId: true, answeredAt: true, isCorrect: true, skillKey: true, attempt: { select: { submittedAt: true } } },
    orderBy: { answeredAt: "asc" },
  });
  const exposure = new Map<string, Exposure>();
  const wrongSkills = new Set<string>();
  for (const r of rows) {
    const at = r.answeredAt ?? r.attempt.submittedAt ?? new Date(0);
    const cur = exposure.get(r.questionId);
    exposure.set(r.questionId, { timesSeen: (cur?.timesSeen ?? 0) + 1, lastSeenAt: at, lastCorrect: r.isCorrect });
    if (r.isCorrect === false) wrongSkills.add(r.skillKey);
  }
  return { exposure, wrongSkills };
}

export async function createMock(userId: string, input: CreateMockInput, opts: { now?: Date; policy?: LearningPolicy } = {}) {
  const now = opts.now ?? new Date();
  const policy = opts.policy ?? DEFAULT_POLICY;
  const { id: syllabusVersionId, config: cfg } = await getActiveConfig();
  const type = input.type as MockTypeT;

  let topics = cfg.syllabus.flatMap((s) => s.topics.map((t) => ({ id: t.id, subjectId: s.id, name: t.name, weight: t.weight })));
  if (type === "SUBJECT") {
    if (!input.subjectId || !cfg.syllabus.some((s) => s.id === input.subjectId)) throw new HttpError(400, "Choose a valid subject.");
    topics = topics.filter((t) => t.subjectId === input.subjectId);
  }
  if (type === "TOPIC_PRACTICE") {
    if (!input.topicId || !topics.some((t) => t.id === input.topicId)) throw new HttpError(400, "Choose a valid topic.");
    topics = topics.filter((t) => t.id === input.topicId);
  }
  const count = type === "FULL_LENGTH" ? cfg.pattern.totalQuestions : input.questionCount ?? DEFAULT_COUNTS[type];
  const durationSec = resolveTiming(cfg, type, count, input.durationMinutes);
  const seed = input.seed ?? (hashString(`${userId}:${now.toISOString()}:${type}`) & 0x7fffffff);

  // States are recomputed on submission; a learned topic left idle must still decay to "needs review".
  const stale = await prisma.studentSkillState.findMany({
    where: { userId, level: "TOPIC", state: { in: ["MASTERED", "PROFICIENT"] }, lastPracticedAt: { lt: new Date(now.getTime() - policy.decay.reviewAfterDays * 86_400_000) } },
    select: { nodeId: true },
  });
  if (stale.length) await recomputeProfile(userId, { topicIds: stale.map((s) => s.nodeId), now, policy });

  const [profiles, { exposure, wrongSkills }, poolRows] = await Promise.all([
    topicProfiles(userId),
    exposureFor(userId),
    prisma.question.findMany({
      where: { verificationStatus: eligibleStatuses(), topicId: { in: topics.map((t) => t.id) } },
      select: { id: true, topicId: true, subtopicId: true, subjectId: true, skillKey: true, difficulty: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const pool: CandidateQuestion[] = poolRows;
  if (pool.length === 0) throw new HttpError(409, "The question bank has no eligible questions for this selection yet.");

  const slots = allocateMock({ type, totalQuestions: count, topics, profiles, policy, now, sections: type === "FULL_LENGTH" ? cfg.sections.map((s) => ({ subjectId: s.subjectId, questions: s.questions })) : undefined });
  const { selected, shortages } = selectQuestions({
    slots, pool, exposure, wrongSkills, policy, seed, now,
    topicStates: new Map([...profiles.entries()].map(([k, v]) => [k, v.state])),
    diagnostic: type === "DIAGNOSTIC",
  });
  if (selected.length === 0) throw new HttpError(409, "Not enough eligible questions to build this mock.");

  // Order: full-length mocks follow the paper's section order; others are interleaved by seed.
  const subjectOrder = new Map(cfg.sections.map((s, i) => [s.subjectId, i]));
  const qMeta = new Map(poolRows.map((q) => [q.id, q]));
  const fullQs = await prisma.question.findMany({ where: { id: { in: selected.map((s) => s.questionId) } }, select: { id: true, correctOption: true, difficulty: true, topicId: true, subtopicId: true, subjectId: true } });
  const fullMap = new Map(fullQs.map((q) => [q.id, q]));
  const ordered = [...selected].sort((a, b) => {
    if (type === "FULL_LENGTH") {
      const d = (subjectOrder.get(qMeta.get(a.questionId)!.subjectId) ?? 0) - (subjectOrder.get(qMeta.get(b.questionId)!.subjectId) ?? 0);
      if (d) return d;
    }
    return hashString(`${seed}:${a.questionId}`) - hashString(`${seed}:${b.questionId}`);
  });

  const diffDist = { EASY: 0, MEDIUM: 0, HARD: 0 } as Record<string, number>;
  for (const s of selected) diffDist[fullMap.get(s.questionId)!.difficulty]++;
  const subjectName = input.subjectId ? cfg.syllabus.find((s) => s.id === input.subjectId)?.name : undefined;
  const topicName = input.topicId ? topics.find((t) => t.id === input.topicId)?.name : undefined;

  const mock = await prisma.mockTest.create({
    data: {
      userId, syllabusVersionId, type: type as MockType, seed, durationSec, questionCount: ordered.length,
      title: TYPE_TITLES[type] + (topicName ? `: ${topicName}` : subjectName ? `: ${subjectName}` : ""),
      feedbackMode: input.feedbackMode ?? (type === "TOPIC_PRACTICE" ? "IMMEDIATE" : "END_OF_SET"),
      markingScheme: cfg.pattern.marking,
      allocation: slots as unknown as Prisma.InputJsonValue,
      selectionCriteria: {
        policyVersion: policy.version, examConfigVersion: cfg.version, eligibleStatuses: allowProvisional() ? ["VERIFIED", "PROVISIONAL"] : ["VERIFIED"],
        requestedCount: count, difficultyDistribution: diffDist, previouslySeen: selected.filter((s) => s.previouslySeen).length,
        sectionTotals: type === "FULL_LENGTH" ? cfg.sections.map((s) => ({ subjectId: s.subjectId, questions: s.questions })) : undefined,
      },
      shortages: shortages as unknown as Prisma.InputJsonValue,
      scope: { subjectId: input.subjectId ?? null, topicId: input.topicId ?? null },
      createdAt: now,
      questions: {
        create: ordered.map((s, i) => {
          const q = fullMap.get(s.questionId)!;
          return { questionId: s.questionId, position: i + 1, slotCategory: s.slotCategory, reason: s.reason, previouslySeen: s.previouslySeen, correctOptionSnapshot: q.correctOption, difficultySnapshot: q.difficulty, topicIdSnapshot: q.topicId, subtopicIdSnapshot: q.subtopicId };
        }),
      },
    },
  });
  return mock;
}

export async function startAttempt(userId: string, mockId: string, now = new Date()) {
  const mock = await prisma.mockTest.findFirst({ where: { id: mockId, userId }, include: { attempt: true, questions: { select: { id: true, questionId: true, topicIdSnapshot: true, subtopicIdSnapshot: true, difficultySnapshot: true, question: { select: { skillKey: true } } } } } });
  if (!mock) throw new HttpError(404, "Mock not found.");
  if (mock.attempt) return mock.attempt;
  try {
    return await prisma.attempt.create({
      data: {
        mockTestId: mock.id, userId, startedAt: now, deadlineAt: new Date(now.getTime() + mock.durationSec * 1000),
        responses: {
          create: mock.questions.map((q) => ({ mockTestQuestionId: q.id, questionId: q.questionId, userId, topicId: q.topicIdSnapshot, subtopicId: q.subtopicIdSnapshot, skillKey: q.question.skillKey, difficulty: q.difficultySnapshot })),
        },
      },
    });
  } catch (e) {
    // Unique constraint on mockTestId: a concurrent request already started it.
    const existing = await prisma.attempt.findFirst({ where: { mockTestId: mock.id, userId } });
    if (existing) return existing;
    throw e;
  }
}

export const saveAnswerSchema = z.object({
  mockTestQuestionId: z.string().min(1).max(64),
  selectedOption: z.enum(["A", "B", "C", "D", "E", "F"]).nullable().optional(),
  timeSpentMs: z.number().int().min(0).max(24 * 3600 * 1000),
  markedForReview: z.boolean().optional(),
  selfConfidence: z.number().int().min(1).max(3).nullable().optional(),
  visit: z.boolean().optional(),
});

async function loadOwnedAttempt(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({ where: { id: attemptId, userId }, include: { mockTest: { select: { id: true, feedbackMode: true, durationSec: true } } } });
  if (!attempt) throw new HttpError(404, "Attempt not found.");
  return attempt;
}

/** Persist one answer. Reliable: the client retries with the full state; the server keeps the latest. */
export async function saveAnswer(userId: string, attemptId: string, raw: unknown, now = new Date()) {
  const input = saveAnswerSchema.parse(raw);
  const attempt = await loadOwnedAttempt(userId, attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new HttpError(409, "This attempt has already been submitted.");
  if (now.getTime() > attempt.deadlineAt.getTime() + GRACE_MS) {
    await submitAttempt(userId, attemptId, { auto: true, now });
    throw new HttpError(409, "Time is up. Your answers were submitted automatically.");
  }
  const resp = await prisma.response.findFirst({ where: { attemptId, mockTestQuestionId: input.mockTestQuestionId }, include: { mockTestQuestion: { select: { question: { select: { options: true } } } } } });
  if (!resp) throw new HttpError(404, "Question not found in this attempt.");
  if (resp.feedbackShown && input.selectedOption !== undefined && input.selectedOption !== resp.selectedOption) throw new HttpError(409, "Feedback has been shown for this question; the answer is locked.");
  const options = resp.mockTestQuestion.question.options as unknown as QuestionOption[];
  if (input.selectedOption && !options.some((o) => o.key === input.selectedOption)) throw new HttpError(400, "That option does not exist for this question.");
  const elapsed = now.getTime() - attempt.startedAt.getTime();
  const changed = input.selectedOption !== undefined && input.selectedOption !== resp.selectedOption;
  await prisma.response.update({
    where: { id: resp.id },
    data: {
      timeSpentMs: clampTime(input.timeSpentMs, elapsed),
      ...(input.selectedOption !== undefined ? { selectedOption: input.selectedOption, answeredAt: input.selectedOption ? now : null } : {}),
      ...(changed && resp.selectedOption ? { answerChanges: { increment: 1 } } : {}),
      ...(input.markedForReview !== undefined ? { markedForReview: input.markedForReview } : {}),
      ...(input.selfConfidence !== undefined ? { selfConfidence: input.selfConfidence } : {}),
      ...(input.visit ? { visits: { increment: 1 } } : {}),
    },
  });
  return { ok: true, savedAt: now.toISOString() };
}

/** Immediate-feedback mode: reveal correctness for an answered question and lock it. */
export async function revealFeedback(userId: string, attemptId: string, mockTestQuestionId: string) {
  const attempt = await loadOwnedAttempt(userId, attemptId);
  if (attempt.mockTest.feedbackMode !== "IMMEDIATE") throw new HttpError(400, "This set shows feedback at the end.");
  const resp = await prisma.response.findFirst({ where: { attemptId, mockTestQuestionId }, include: { mockTestQuestion: { include: { question: true } } } });
  if (!resp) throw new HttpError(404, "Question not found in this attempt.");
  if (!resp.selectedOption) throw new HttpError(400, "Answer the question first.");
  await prisma.response.update({ where: { id: resp.id }, data: { feedbackShown: true } });
  const q = resp.mockTestQuestion.question;
  return {
    correctOption: resp.mockTestQuestion.correctOptionSnapshot,
    isCorrect: resp.selectedOption === resp.mockTestQuestion.correctOptionSnapshot,
    explanation: q.explanation, explanationHi: q.explanationHi,
    options: q.options as unknown as QuestionOption[],
  };
}

/**
 * Submit (manual or automatic). Idempotent: concurrent or repeated submissions resolve to the same result.
 */
export async function submitAttempt(userId: string, attemptId: string, opts: { auto?: boolean; now?: Date; policy?: LearningPolicy } = {}) {
  const now = opts.now ?? new Date();
  const attempt = await prisma.attempt.findFirst({ where: { id: attemptId, userId }, include: { mockTest: true } });
  if (!attempt) throw new HttpError(404, "Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") return { attemptId, alreadySubmitted: true };
  const pastDeadline = now.getTime() > attempt.deadlineAt.getTime();
  const claimed = await prisma.attempt.updateMany({
    where: { id: attemptId, userId, status: "IN_PROGRESS" },
    data: { status: opts.auto || pastDeadline ? "AUTO_SUBMITTED" : "SUBMITTED", submittedAt: pastDeadline ? attempt.deadlineAt : now },
  });
  if (claimed.count === 0) return { attemptId, alreadySubmitted: true };
  const submittedAt = pastDeadline ? attempt.deadlineAt : now;

  const responses = await prisma.response.findMany({
    where: { attemptId },
    include: { mockTestQuestion: { select: { correctOptionSnapshot: true, position: true } }, question: { select: { subjectId: true, expectedTimeSec: true, isNumerical: true, options: true } } },
  });
  // Context from the student's history BEFORE this attempt.
  const topicIds = [...new Set(responses.map((r) => r.topicId))];
  const prior = await loadEvents(prisma, userId, topicIds);
  const priorByTopic = new Map<string, typeof prior>();
  for (const e of prior) (priorByTopic.get(e.topicId) ?? priorByTopic.set(e.topicId, []).get(e.topicId)!).push(e);

  const scheme = attempt.mockTest.markingScheme as { correct: number; incorrect: number; unanswered: number };
  const result = scoreItems(
    responses.map((r) => ({ questionId: r.questionId, subjectId: r.question.subjectId, topicId: r.topicId, correctOption: r.mockTestQuestion.correctOptionSnapshot, selectedOption: r.selectedOption, timeSpentMs: r.timeSpentMs })),
    scheme,
  );
  const updates = responses.map((r) => {
    const isCorrect = r.selectedOption ? r.selectedOption === r.mockTestQuestion.correctOptionSnapshot : null;
    const hist = priorByTopic.get(r.topicId) ?? [];
    const answered = hist.filter((h) => h.isCorrect !== null);
    const opts = r.question.options as unknown as QuestionOption[];
    const mis = isCorrect === false ? opts.find((o) => o.key === r.selectedOption)?.misconception ?? null : null;
    const diag = classifyError({
      isCorrect, timeSpentMs: r.timeSpentMs, expectedTimeSec: r.question.expectedTimeSec, difficulty: r.difficulty, isNumerical: r.question.isNumerical,
      misconception: mis,
      studentMedianMs: quantile(answered.map((h) => h.timeSpentMs).sort((a, b) => a - b), 0.5),
      priorTopicAccuracy: answered.length ? answered.filter((h) => h.isCorrect).length / answered.length : null,
      priorTopicAttempts: answered.length,
      priorSameMisconception: mis ? hist.filter((h) => h.misconception === mis).length : 0,
      previouslyCorrectSameQuestion: hist.some((h) => h.questionId === r.questionId && h.isCorrect),
      previouslyCorrectSameSkill: hist.some((h) => h.skillKey === r.skillKey && h.isCorrect),
      selfConfidence: r.selfConfidence, answerChanges: r.answerChanges,
    });
    return prisma.response.update({
      where: { id: r.id },
      data: {
        isCorrect, scored: true, answeredAt: r.answeredAt ?? submittedAt,
        errorCategory: diag?.category ?? null, errorConfidence: diag?.confidence ?? null, errorIsTentative: diag?.tentative ?? null,
        errorEvidence: diag ? ({ evidence: diag.evidence, alternatives: diag.alternatives } as Prisma.InputJsonValue) : undefined,
      },
    });
  });
  const diagnosed = await prisma.$transaction(updates);
  const patterns = summariseErrorPatterns(diagnosed.filter((d) => d.errorCategory).map((d) => ({ category: d.errorCategory as ErrorCategoryT, confidence: d.errorConfidence ?? 0.3 })));
  const timeSpentSec = Math.round(Math.min(submittedAt.getTime() - attempt.startedAt.getTime(), attempt.mockTest.durationSec * 1000) / 1000);
  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      score: result.score, maxScore: result.maxScore, correctCount: result.correct, incorrectCount: result.incorrect, unansweredCount: result.unanswered, timeSpentSec,
      summary: { percentage: result.percentage, bySubject: result.bySubject, byTopic: result.byTopic, errorPatterns: patterns, profileUpdated: false } as unknown as Prisma.InputJsonValue,
    },
  });
  await recomputeProfile(userId, { topicIds, attemptId, now: submittedAt, policy: opts.policy });
  await prisma.attempt.update({ where: { id: attemptId }, data: { summary: { percentage: result.percentage, bySubject: result.bySubject, byTopic: result.byTopic, errorPatterns: patterns, profileUpdated: true } as unknown as Prisma.InputJsonValue } });
  // Feed observed difficulty back into the bank (calibration signal for admins; never changes answers).
  await prisma.$executeRaw`
    UPDATE "Question" q SET "observedAttempts" = s.n, "observedPValue" = s.p
    FROM (SELECT "questionId", COUNT(*)::int n, AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) p FROM "Response" WHERE scored = true AND "questionId" IN (SELECT "questionId" FROM "Response" WHERE "attemptId" = ${attemptId}) GROUP BY "questionId") s
    WHERE q.id = s."questionId"`;
  return { attemptId, alreadySubmitted: false };
}

/** Auto-submits this user's attempts whose deadline (plus grace) has passed. Called lazily on page loads. */
export async function expireOverdue(userId?: string, now = new Date()) {
  const overdue = await prisma.attempt.findMany({ where: { status: "IN_PROGRESS", deadlineAt: { lt: new Date(now.getTime() - GRACE_MS) }, ...(userId ? { userId } : {}) }, select: { id: true, userId: true }, take: 50 });
  for (const a of overdue) await submitAttempt(a.userId, a.id, { auto: true, now });
  return overdue.length;
}
