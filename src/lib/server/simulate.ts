/**
 * Synthetic learners for verification, demos and load tests. A simulated student answers through the
 * same server functions the web app uses (createMock → startAttempt → saveAnswer → submitAttempt),
 * on a controllable clock, with a per-topic probability of answering correctly.
 * All accounts use the reserved example.invalid domain; no real student data is involved.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { createMock, startAttempt, saveAnswer, submitAttempt, type CreateMockInput } from "./mocks";
import { mulberry32, type Rng } from "../rng";
import type { LearningPolicy } from "../engine/policy";

export const DAY = 86_400_000;

// bcrypt hash of a random throwaway string: simulated accounts cannot be logged into.
const UNUSABLE_HASH = "$2a$04$" + randomBytes(40).toString("base64").replace(/[^A-Za-z0-9./]/g, "").slice(0, 53).padEnd(53, "x");

export async function createSyntheticStudent(label: string) {
  const tag = randomBytes(4).toString("hex");
  return prisma.user.create({ data: { email: `sim-${label}-${tag}@example.invalid`, name: `Synthetic ${label}`, passwordHash: UNUSABLE_HASH } });
}

export interface LearnerModel {
  /** Probability of a correct answer for a topic. */
  pCorrect: (topicId: string, difficulty: "EASY" | "MEDIUM" | "HARD") => number;
  /** Probability of leaving a question unanswered when not answering correctly. */
  skipRate?: number;
  /** Multiplier on each question's expected time. */
  speed?: (topicId: string) => number;
}

export interface TakenMock {
  mockId: string;
  attemptId: string;
  items: Array<{ questionId: string; topicId: string; slotCategory: string; previouslySeen: boolean; correct: boolean | null }>;
  allocation: unknown;
  shortages: unknown;
}

export async function takeMock(userId: string, input: CreateMockInput, model: LearnerModel, opts: { now: Date; rng?: Rng; policy?: LearningPolicy }): Promise<TakenMock> {
  const rng = opts.rng ?? mulberry32(Math.floor(opts.now.getTime() / 1000));
  const created = await createMock(userId, input, { now: opts.now, policy: opts.policy });
  const mockId = created.id;
  const attempt = await startAttempt(userId, mockId, opts.now);
  const mqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId: mockId },
    orderBy: { position: "asc" },
    select: { id: true, questionId: true, topicIdSnapshot: true, difficultySnapshot: true, correctOptionSnapshot: true, slotCategory: true, previouslySeen: true, question: { select: { options: true, expectedTimeSec: true } } },
  });
  let clock = opts.now.getTime();
  const items: TakenMock["items"] = [];
  for (const q of mqs) {
    const keys = (q.question.options as Array<{ key: string }>).map((o) => o.key);
    const p = model.pCorrect(q.topicIdSnapshot, q.difficultySnapshot);
    const r = rng();
    let selected: string | null;
    if (r < p) selected = q.correctOptionSnapshot;
    else if (rng() < (model.skipRate ?? 0.15)) selected = null;
    else {
      const wrong = keys.filter((k) => k !== q.correctOptionSnapshot);
      selected = wrong[Math.floor(rng() * wrong.length)];
    }
    const timeMs = Math.round(q.question.expectedTimeSec * 1000 * (model.speed?.(q.topicIdSnapshot) ?? 1) * (0.6 + rng() * 0.8));
    clock += timeMs;
    await saveAnswer(userId, attempt.id, { mockTestQuestionId: q.id, selectedOption: selected, timeSpentMs: timeMs, visit: true }, new Date(clock));
    items.push({ questionId: q.questionId, topicId: q.topicIdSnapshot, slotCategory: q.slotCategory, previouslySeen: q.previouslySeen, correct: selected === null ? null : selected === q.correctOptionSnapshot });
  }
  await submitAttempt(userId, attempt.id, { now: new Date(clock + 1000), policy: opts.policy });
  const mock = await prisma.mockTest.findUniqueOrThrow({ where: { id: mockId }, select: { allocation: true, shortages: true } });
  return { mockId, attemptId: attempt.id, items, allocation: mock.allocation, shortages: mock.shortages };
}

export function topicCounts(items: Array<{ topicId: string }>) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.topicId, (m.get(i.topicId) ?? 0) + 1);
  return m;
}

export function share(items: Array<{ topicId: string }>, topics: string[]) {
  return items.length ? items.filter((i) => topics.includes(i.topicId)).length / items.length : 0;
}

export async function topicState(userId: string, topicId: string) {
  return prisma.studentSkillState.findUnique({ where: { userId_level_nodeId: { userId, level: "TOPIC", nodeId: topicId } } });
}

export async function removeSyntheticStudents() {
  const r = await prisma.user.deleteMany({ where: { email: { endsWith: "@example.invalid" }, name: { startsWith: "Synthetic " } } });
  // Recompute observed difficulty so synthetic answers do not linger in the calibration statistics.
  await prisma.$executeRaw`UPDATE "Question" q SET "observedAttempts" = COALESCE(s.n, 0), "observedPValue" = s.p
    FROM (SELECT q2.id, r.n, r.p FROM "Question" q2 LEFT JOIN (SELECT "questionId", COUNT(*)::int n, AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) p FROM "Response" WHERE scored GROUP BY "questionId") r ON r."questionId" = q2.id) s
    WHERE q.id = s.id`;
  return r;
}

/** Learner who is weak on `weak` topics and solid elsewhere; can improve over time via `boost`. */
export function profileLearner(weak: string[], pWeak = 0.2, pStrong = 0.85, boost: () => number = () => 0): LearnerModel {
  return { pCorrect: (t) => (weak.includes(t) ? Math.min(0.95, pWeak + boost()) : pStrong), skipRate: 0.2 };
}
