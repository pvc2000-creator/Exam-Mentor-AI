import { prisma } from "./db";
import { expireOverdue } from "./mocks";
import type { MasteryStateT } from "../engine/mastery";

export async function topicCatalog() {
  const subjects = await prisma.subject.findMany({ orderBy: { sortOrder: "asc" }, include: { topics: { orderBy: { sortOrder: "asc" }, include: { subtopics: { orderBy: { sortOrder: "asc" } } } } } });
  const topicName = new Map<string, string>();
  const topicSubject = new Map<string, string>();
  const subtopicName = new Map<string, string>();
  for (const s of subjects)
    for (const t of s.topics) {
      topicName.set(t.id, t.name);
      topicSubject.set(t.id, s.id);
      for (const st of t.subtopics) subtopicName.set(st.id, st.name);
    }
  return { subjects, topicName, topicSubject, subtopicName };
}

export async function getDashboard(userId: string) {
  await expireOverdue(userId);
  const [catalog, attempts, inProgress, states, agg, recs, recentWrong, milestones] = await Promise.all([
    topicCatalog(),
    prisma.attempt.findMany({ where: { userId, status: { not: "IN_PROGRESS" } }, orderBy: { submittedAt: "desc" }, take: 20, include: { mockTest: { select: { type: true, title: true } } } }),
    prisma.attempt.findFirst({ where: { userId, status: "IN_PROGRESS" }, include: { mockTest: { select: { title: true } } }, orderBy: { startedAt: "desc" } }),
    prisma.studentSkillState.findMany({ where: { userId, level: "TOPIC" } }),
    prisma.response.groupBy({ by: ["topicId"], where: { userId, scored: true }, _count: { _all: true, selectedOption: true }, _sum: { timeSpentMs: true } }),
    prisma.recommendation.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { priority: "desc" }, take: 4 }),
    prisma.response.findMany({ where: { userId, scored: true, isCorrect: false }, orderBy: { answeredAt: "desc" }, take: 5, select: { id: true, topicId: true, errorCategory: true, errorIsTentative: true, attemptId: true, question: { select: { stem: true } } } }),
    prisma.masteryMilestone.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const correctByTopic = await prisma.response.groupBy({ by: ["topicId"], where: { userId, scored: true, isCorrect: true }, _count: { _all: true } });
  const correctMap = new Map(correctByTopic.map((c) => [c.topicId, c._count._all]));
  const subjects = new Map<string, { attempted: number; correct: number; total: number }>();
  let totalQ = 0, answered = 0, correct = 0, timeSum = 0;
  for (const a of agg) {
    const sid = catalog.topicSubject.get(a.topicId) ?? "other";
    const s = subjects.get(sid) ?? { attempted: 0, correct: 0, total: 0 };
    s.total += a._count._all;
    s.attempted += a._count.selectedOption;
    s.correct += correctMap.get(a.topicId) ?? 0;
    subjects.set(sid, s);
    totalQ += a._count._all;
    answered += a._count.selectedOption;
    correct += correctMap.get(a.topicId) ?? 0;
    timeSum += a._sum.timeSpentMs ?? 0;
  }
  const stateCounts: Record<MasteryStateT, number> = { NOT_STARTED: 0, INSUFFICIENT_DATA: 0, WEAK: 0, DEVELOPING: 0, PROFICIENT: 0, MASTERED: 0, NEEDS_REVIEW: 0 };
  const stateMap = new Map(states.map((s) => [s.nodeId, s]));
  for (const id of catalog.topicName.keys()) stateCounts[(stateMap.get(id)?.state ?? "NOT_STARTED") as MasteryStateT]++;
  const named = states.map((s) => ({ ...s, name: catalog.topicName.get(s.nodeId) ?? s.nodeId }));
  return {
    catalog,
    attempts: attempts.map((a) => ({ id: a.id, title: a.mockTest.title, type: a.mockTest.type, submittedAt: a.submittedAt, score: a.score, maxScore: a.maxScore, pct: a.maxScore ? (a.score ?? 0) / a.maxScore : 0, correct: a.correctCount, incorrect: a.incorrectCount, unanswered: a.unansweredCount, status: a.status })),
    inProgress,
    totals: { questions: totalQ, answered, correct, accuracy: answered ? correct / answered : null, avgTimeMs: answered ? timeSum / totalQ : null },
    subjects: catalog.subjects.map((s) => ({ id: s.id, name: s.name, ...(subjects.get(s.id) ?? { attempted: 0, correct: 0, total: 0 }) })),
    weak: named.filter((s) => s.state === "WEAK" || s.state === "NEEDS_REVIEW").sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 6),
    strong: named.filter((s) => s.state === "PROFICIENT" || s.state === "MASTERED").sort((a, b) => b.masteryScore - a.masteryScore).slice(0, 6),
    stateCounts,
    recs,
    recentWrong,
    milestones: milestones.map((m) => ({ ...m, name: catalog.topicName.get(m.nodeId) ?? m.nodeId })),
  };
}
