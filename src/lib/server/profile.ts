/**
 * Builds and stores each student's learning profile from their raw responses.
 * Derived tables (StudentSkillState, MasterySnapshot, MasteryMilestone, Recommendation) can always be
 * rebuilt from Response rows, which are never deleted when a topic is mastered.
 */
import type { MasteryState, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { computeSkillState, type ResponseEvent, type SkillMetrics } from "../engine/mastery";
import { DEFAULT_POLICY, type LearningPolicy } from "../engine/policy";
import { summariseErrorPatterns, type ErrorCategoryT } from "../engine/errors";
import { buildRecommendations, type RecTopic } from "../engine/recommendations";
import type { QuestionOption } from "../questions/types";

type Db = Prisma.TransactionClient | typeof prisma;

export async function loadEvents(db: Db, userId: string, topicIds?: string[]) {
  const rows = await db.response.findMany({
    where: { userId, scored: true, ...(topicIds ? { topicId: { in: topicIds } } : {}) },
    select: {
      questionId: true, skillKey: true, topicId: true, subtopicId: true, difficulty: true, isCorrect: true,
      timeSpentMs: true, answeredAt: true, selectedOption: true, errorCategory: true, errorConfidence: true,
      attempt: { select: { submittedAt: true } },
      question: { select: { expectedTimeSec: true, options: true } },
    },
    orderBy: [{ answeredAt: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => {
    const opts = r.question.options as unknown as QuestionOption[];
    const mis = r.selectedOption && r.isCorrect === false ? opts.find((o) => o.key === r.selectedOption)?.misconception ?? null : null;
    const ev: ResponseEvent & { topicId: string; subtopicId: string | null; errorCategory: ErrorCategoryT | null; errorConfidence: number | null } = {
      questionId: r.questionId,
      skillKey: r.skillKey,
      difficulty: r.difficulty,
      isCorrect: r.isCorrect,
      timeSpentMs: r.timeSpentMs,
      expectedTimeSec: r.question.expectedTimeSec,
      at: r.answeredAt ?? r.attempt.submittedAt ?? new Date(0),
      misconception: mis,
      topicId: r.topicId,
      subtopicId: r.subtopicId,
      errorCategory: r.errorCategory,
      errorConfidence: r.errorConfidence,
    };
    return ev;
  });
}

function stateData(m: SkillMetrics) {
  return {
    attempts: m.attempts, correct: m.correct, incorrect: m.incorrect, unanswered: m.unanswered,
    distinctQuestions: m.distinctQuestions, accuracy: m.accuracy, smoothedAccuracy: m.smoothedAccuracy,
    recentAccuracy: m.recentAccuracy, difficultyAdjusted: m.difficultyAdjusted, medianTimeMs: m.medianTimeMs,
    p25TimeMs: m.p25TimeMs, p75TimeMs: m.p75TimeMs, slowShare: m.slowShare, repeatedMistakes: m.repeatedMistakes,
    masteryScore: m.masteryScore, confidence: m.confidence, state: m.state as MasteryState, stateReason: m.stateReason,
    gateProgress: m.gate as unknown as Prisma.InputJsonValue, trend: m.trend, lastPracticedAt: m.lastPracticedAt,
    masteredAt: m.masteredAt, retentionDueAt: m.retentionDueAt, retentionPassedAt: m.retentionPassedAt, nextAction: m.nextAction,
  };
}

/**
 * Recomputes topic and subtopic states for the given topics (or every practised topic), records
 * snapshots for an attempt, emits milestones on state transitions and refreshes recommendations.
 */
export async function recomputeProfile(userId: string, opts: { topicIds?: string[]; attemptId?: string; now?: Date; policy?: LearningPolicy } = {}) {
  const now = opts.now ?? new Date();
  const policy = opts.policy ?? DEFAULT_POLICY;
  const events = await loadEvents(prisma, userId, opts.topicIds);
  const byTopic = new Map<string, typeof events>();
  const bySub = new Map<string, typeof events>();
  for (const e of events) {
    (byTopic.get(e.topicId) ?? byTopic.set(e.topicId, []).get(e.topicId)!).push(e);
    if (e.subtopicId) (bySub.get(e.subtopicId) ?? bySub.set(e.subtopicId, []).get(e.subtopicId)!).push(e);
  }
  const nodes: Array<{ level: "TOPIC" | "SUBTOPIC"; nodeId: string; m: SkillMetrics }> = [];
  for (const [id, evs] of byTopic) nodes.push({ level: "TOPIC", nodeId: id, m: computeSkillState(evs, policy, now) });
  for (const [id, evs] of bySub) nodes.push({ level: "SUBTOPIC", nodeId: id, m: computeSkillState(evs, policy, now) });

  const previous = new Map(
    (await prisma.studentSkillState.findMany({ where: { userId, nodeId: { in: nodes.map((n) => n.nodeId) } }, select: { level: true, nodeId: true, state: true } })).map((s) => [`${s.level}:${s.nodeId}`, s.state]),
  );

  await prisma.$transaction(async (tx) => {
    for (const n of nodes) {
      const data = stateData(n.m);
      await tx.studentSkillState.upsert({
        where: { userId_level_nodeId: { userId, level: n.level, nodeId: n.nodeId } },
        create: { userId, level: n.level, nodeId: n.nodeId, ...data },
        update: data,
      });
      const prev = previous.get(`${n.level}:${n.nodeId}`);
      if (n.level === "TOPIC" && prev !== n.m.state) {
        const kind =
          n.m.state === "MASTERED" ? "MASTERY_ACHIEVED"
          : (prev === "MASTERED" || prev === "PROFICIENT") && (n.m.state === "NEEDS_REVIEW" || n.m.state === "WEAK") ? "MASTERY_LOST"
          : n.m.state === "WEAK" && prev !== undefined && prev !== "INSUFFICIENT_DATA" && prev !== "NOT_STARTED" ? "BECAME_WEAK"
          : null;
        if (kind) await tx.masteryMilestone.create({ data: { userId, level: "TOPIC", nodeId: n.nodeId, kind, detail: `${prev ?? "NEW"} → ${n.m.state}: ${n.m.stateReason}` } });
        if (kind === "MASTERY_ACHIEVED" && n.m.retentionPassedAt)
          await tx.masteryMilestone.create({ data: { userId, level: "TOPIC", nodeId: n.nodeId, kind: "RETENTION_CONFIRMED", detail: `Retention check passed on ${n.m.retentionPassedAt.toISOString().slice(0, 10)}` } });
      }
    }
    if (opts.attemptId) {
      await tx.masterySnapshot.createMany({
        data: nodes.map((n) => ({ userId, attemptId: opts.attemptId!, level: n.level, nodeId: n.nodeId, masteryScore: n.m.masteryScore, confidence: n.m.confidence, state: n.m.state as MasteryState, accuracy: n.m.accuracy, createdAt: now })),
      });
    }
  }, { timeout: 30_000 });

  await refreshRecommendations(userId, now, opts.attemptId);
  return nodes;
}

export async function topicErrorPatterns(userId: string, since: Date) {
  const rows = await prisma.response.findMany({
    where: { userId, scored: true, isCorrect: { not: true }, errorCategory: { not: null }, answeredAt: { gte: since } },
    select: { topicId: true, errorCategory: true, errorConfidence: true },
  });
  const by = new Map<string, Array<{ category: ErrorCategoryT; confidence: number }>>();
  for (const r of rows) (by.get(r.topicId) ?? by.set(r.topicId, []).get(r.topicId)!).push({ category: r.errorCategory as ErrorCategoryT, confidence: r.errorConfidence ?? 0.3 });
  return new Map([...by.entries()].map(([k, v]) => [k, summariseErrorPatterns(v)]));
}

export async function incorrectToRetry(userId: string) {
  // Questions whose latest response was wrong.
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT DISTINCT ON ("questionId") "questionId", "isCorrect"
      FROM "Response" WHERE "userId" = ${userId} AND scored = true AND "selectedOption" IS NOT NULL
      ORDER BY "questionId", "answeredAt" DESC NULLS LAST
    ) t WHERE t."isCorrect" = false`;
  return Number(rows[0]?.n ?? 0);
}

export async function refreshRecommendations(userId: string, now = new Date(), attemptId?: string) {
  const [topics, states, totalAttempts, patterns, retry] = await Promise.all([
    prisma.topic.findMany({ select: { id: true, name: true } }),
    prisma.studentSkillState.findMany({ where: { userId, level: "TOPIC" } }),
    prisma.response.count({ where: { userId, scored: true } }),
    topicErrorPatterns(userId, new Date(now.getTime() - 60 * 86_400_000)),
    incorrectToRetry(userId),
  ]);
  const sMap = new Map(states.map((s) => [s.nodeId, s]));
  const recTopics: RecTopic[] = topics.map((t) => {
    const s = sMap.get(t.id);
    return {
      topicId: t.id, name: t.name, state: (s?.state ?? "NOT_STARTED") as RecTopic["state"], masteryScore: s?.masteryScore ?? 0,
      confidence: s?.confidence ?? 0, attempts: s?.attempts ?? 0, accuracy: s?.accuracy ?? 0, recentAccuracy: s?.recentAccuracy ?? null,
      slowShare: s?.slowShare ?? 0, repeatedMistakes: s?.repeatedMistakes ?? 0, trend: s?.trend ?? null, retentionDueAt: s?.retentionDueAt ?? null,
      topErrors: (patterns.get(t.id) ?? []).map((p) => ({ category: p.category, count: p.count, status: p.status })),
    };
  });
  const recs = buildRecommendations(recTopics, { totalAttempts, now, incorrectToRetry: retry });
  await prisma.$transaction([
    prisma.recommendation.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "SUPERSEDED" } }),
    prisma.recommendation.createMany({ data: recs.map((r) => ({ userId, kind: r.kind, nodeId: r.nodeId, title: r.title, reason: r.reason, priority: r.priority, attemptId: attemptId ?? null, createdAt: now })) }),
  ]);
  return recs;
}
