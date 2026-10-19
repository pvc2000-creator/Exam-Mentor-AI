/**
 * Acceptance scenarios H–K run against a real database with synthetic learners on a simulated clock.
 * Used by `npm run simulate:learners` (which writes docs/simulation_results.md) and the integration tests.
 */
import { prisma } from "./db";
import { DAY, createSyntheticStudent, profileLearner, share, takeMock, topicCounts, topicState, type LearnerModel, type TakenMock } from "./simulate";
import { mulberry32 } from "../rng";
import type { Slot } from "../engine/allocation";

export interface ScenarioResult {
  id: string;
  title: string;
  passed: boolean;
  evidence: string[];
}

const fmt = (x: number) => `${Math.round(x * 100)}%`;
const slotsFor = (m: TakenMock, topicId: string) => (m.allocation as Slot[]).filter((s) => s.topicId === topicId).reduce((a, s) => a + s.count, 0);
const categoryOf = (m: TakenMock, topicId: string) => (m.allocation as Slot[]).find((s) => s.topicId === topicId)?.category ?? "none";

export const WEAK_A = ["ar-percentage", "ar-profit-loss", "ar-ratio"];
export const WEAK_B = ["gk-mp", "gk-history", "gk-geography"];

/** H: two students with different weaknesses get different personalised mocks after the same baseline. I: remediation is varied. */
export async function scenarioHI(start = new Date("2026-01-05T09:00:00Z"), adaptiveRounds = 4): Promise<ScenarioResult[]> {
  const a = await createSyntheticStudent("arith-weak");
  const b = await createSyntheticStudent("gk-weak");
  const la = profileLearner(WEAK_A, 0.15, 0.9);
  const lb = profileLearner(WEAK_B, 0.15, 0.9);
  // Same baseline: same mock type and seed, and no prior history, so both see the same diagnostic.
  const da = await takeMock(a.id, { type: "DIAGNOSTIC", seed: 424242 }, la, { now: start, rng: mulberry32(1) });
  const db = await takeMock(b.id, { type: "DIAGNOSTIC", seed: 424242 }, lb, { now: start, rng: mulberry32(2) });
  const sameBaseline = da.items.map((i) => i.questionId).join() === db.items.map((i) => i.questionId).join();

  // A 30-question diagnostic gives about one question per topic, which cannot separate a real gap from a
  // slip. The comparison is therefore made on the third personalised mock, once evidence has built up.
  const roundsA: TakenMock[] = [];
  const roundsB: TakenMock[] = [];
  for (let k = 1; k <= Math.max(3, adaptiveRounds); k++) {
    const t = new Date(start.getTime() + k * DAY);
    roundsA.push(await takeMock(a.id, { type: "ADAPTIVE_WEAKNESS" }, la, { now: t, rng: mulberry32(10 + k) }));
    if (k <= 3) roundsB.push(await takeMock(b.id, { type: "ADAPTIVE_WEAKNESS" }, lb, { now: t, rng: mulberry32(20 + k) }));
  }
  const ma = roundsA[2];
  const mb = roundsB[2];
  const setA = new Set(ma.items.map((i) => i.questionId));
  const overlap = mb.items.filter((i) => setA.has(i.questionId)).length / Math.max(1, mb.items.length);
  const aOnA = share(ma.items, WEAK_A), bOnA = share(mb.items, WEAK_A), bOnB = share(mb.items, WEAK_B), aOnB = share(ma.items, WEAK_B);
  const h: ScenarioResult = {
    id: "H",
    title: "Two students with different weaknesses receive meaningfully different personalised mocks",
    passed: sameBaseline && aOnA >= bOnA + 0.1 && bOnB >= aOnB + 0.1 && overlap < 0.5,
    evidence: [
      `Both took the same ${da.items.length}-question diagnostic: ${sameBaseline ? "yes" : "no"}. Each then took personalised mocks on consecutive days.`,
      `Student A (weak in percentage, profit/loss, ratio) share of each personalised mock on those topics: ${roundsA.slice(0, 3).map((r) => fmt(share(r.items, WEAK_A))).join(", ")}; student B on the same topics: ${roundsB.map((r) => fmt(share(r.items, WEAK_A))).join(", ")}.`,
      `Student B (weak in MP GK, history, geography) share on those topics: ${roundsB.map((r) => fmt(share(r.items, WEAK_B))).join(", ")}; student A on the same topics: ${roundsA.slice(0, 3).map((r) => fmt(share(r.items, WEAK_B))).join(", ")}.`,
      `Third personalised mock: question overlap between the two students ${fmt(overlap)}.`,
      `After the diagnostic alone (about one question per topic) the difference is small, because one answer cannot separate a gap from a slip; the engine follows up early misses and the gap widens as evidence accumulates.`,
    ],
  };

  // I: keep remediating student A and check that weak-topic questions are new questions on the same skills.
  const rounds = roundsA;
  const weakItems = rounds.flatMap((r) => r.items.filter((i) => WEAK_A.includes(i.topicId)));
  const distinct = new Set(weakItems.map((i) => i.questionId)).size;
  const repeats = weakItems.filter((i) => i.previouslySeen).length;
  const skills = await prisma.question.findMany({ where: { id: { in: [...new Set(weakItems.map((i) => i.questionId))] } }, select: { skillKey: true, subtopicId: true } });
  const i: ScenarioResult = {
    id: "I",
    title: "Remediation questions are varied rather than repeated",
    passed: weakItems.length >= 10 && distinct / weakItems.length >= 0.9 && repeats / weakItems.length <= 0.1,
    evidence: [
      `${weakItems.length} weak-topic questions across ${rounds.length} personalised mocks; ${distinct} distinct (${fmt(distinct / Math.max(1, weakItems.length))}).`,
      `Previously seen questions reused: ${repeats} (${fmt(repeats / Math.max(1, weakItems.length))}).`,
      `They covered ${new Set(skills.map((s) => s.skillKey)).size} skills across ${new Set(skills.map((s) => s.subtopicId)).size} subtopics.`,
      `Weak-topic share per mock: ${rounds.map((r) => fmt(share(r.items, WEAK_A))).join(", ")}.`,
    ],
  };
  return [h, i];
}

/** J: a mastered topic gets low priority but stays in revision. K: it returns to high priority after decline. */
export async function scenarioJK(start = new Date("2026-02-02T09:00:00Z")): Promise<ScenarioResult[]> {
  const focus = "gk-computer";
  const weak = "ar-percentage";
  const c = await createSyntheticStudent("mastery");
  let pFocus = 0.97;
  const model: LearnerModel = { pCorrect: (t) => (t === focus ? pFocus : t === weak ? 0.2 : 0.65), skipRate: 0.1 };
  const at = (d: number) => new Date(start.getTime() + d * DAY);

  await takeMock(c.id, { type: "DIAGNOSTIC" }, model, { now: at(0), rng: mulberry32(21) });
  await takeMock(c.id, { type: "TOPIC_PRACTICE", topicId: focus, questionCount: 10 }, model, { now: at(1), rng: mulberry32(22) });
  await takeMock(c.id, { type: "TOPIC_PRACTICE", topicId: focus, questionCount: 6 }, model, { now: at(3), rng: mulberry32(23) });
  const beforeRetention = await topicState(c.id, focus);
  await takeMock(c.id, { type: "TOPIC_PRACTICE", topicId: focus, questionCount: 5 }, model, { now: at(11), rng: mulberry32(24) });
  const mastered = await topicState(c.id, focus);

  const adaptive = await takeMock(c.id, { type: "ADAPTIVE_WEAKNESS" }, model, { now: at(12), rng: mulberry32(25) });
  const revision = await takeMock(c.id, { type: "REVISION" }, model, { now: at(13), rng: mulberry32(26) });
  const others = (adaptive.allocation as Slot[]).filter((x) => x.topicId !== focus);
  const meanOther = others.reduce((a2, x) => a2 + x.count, 0) / Math.max(1, others.length);
  const served = topicCounts(adaptive.items).get(focus) ?? 0;
  const j: ScenarioResult = {
    id: "J",
    title: "Mastered topics get reduced priority but remain eligible for revision",
    passed: beforeRetention?.state === "PROFICIENT" && mastered?.state === "MASTERED" && slotsFor(adaptive, focus) <= 1 && slotsFor(adaptive, focus) < meanOther && slotsFor(revision, focus) >= 1,
    evidence: [
      `After the first practice sets the topic was ${beforeRetention?.state}: ${beforeRetention?.stateReason}`,
      `After a correct retention check 10 days later: ${mastered?.state}: ${mastered?.stateReason}`,
      `Next personalised mock: ${slotsFor(adaptive, focus)} slot(s) for the mastered topic (category ${categoryOf(adaptive, focus)}), versus an average of ${meanOther.toFixed(1)} for the ${others.length} other topics included; ${served} question(s) served.`,
      `Revision mock the next day: ${slotsFor(revision, focus)} slot(s) for the mastered topic (category ${categoryOf(revision, focus)}), so it stays in revision.`,
    ],
  };

  // K: performance on the mastered topic collapses.
  pFocus = 0.1;
  await takeMock(c.id, { type: "TOPIC_PRACTICE", topicId: focus, questionCount: 8 }, model, { now: at(14), rng: mulberry32(27) });
  const declined = await topicState(c.id, focus);
  const after = await takeMock(c.id, { type: "ADAPTIVE_WEAKNESS" }, model, { now: at(15), rng: mulberry32(28) });
  const recs = await prisma.recommendation.findMany({ where: { userId: c.id, status: "ACTIVE" }, orderBy: { priority: "desc" } });
  const rank = recs.findIndex((r) => r.nodeId === focus);
  const k: ScenarioResult = {
    id: "K",
    title: "A topic returns to high priority when performance deteriorates",
    passed: (declined?.state === "NEEDS_REVIEW" || declined?.state === "WEAK") && slotsFor(after, focus) > slotsFor(adaptive, focus) && rank >= 0 && rank < 5,
    evidence: [
      `After a poor practice set the topic moved to ${declined?.state}: ${declined?.stateReason}`,
      `Slots in the next personalised mock: ${slotsFor(adaptive, focus)} before, ${slotsFor(after, focus)} after (${categoryOf(after, focus)}).`,
      rank >= 0 ? `Recommendation "${recs[rank].title}" is ranked ${rank + 1} of ${recs.length}: ${recs[rank].reason}` : "No recommendation mentions the topic.",
    ],
  };
  return [j, k];
}

/** Profile isolation: one student's activity never changes another student's profile. */
export async function scenarioIsolation(start = new Date("2026-03-02T09:00:00Z")): Promise<ScenarioResult> {
  const a = await createSyntheticStudent("iso-a");
  const b = await createSyntheticStudent("iso-b");
  await takeMock(b.id, { type: "DIAGNOSTIC" }, profileLearner(WEAK_B), { now: start, rng: mulberry32(31) });
  const before = await prisma.studentSkillState.findMany({ where: { userId: b.id }, orderBy: [{ level: "asc" }, { nodeId: "asc" }], select: { nodeId: true, masteryScore: true, attempts: true, state: true } });
  for (let d = 0; d < 3; d++) await takeMock(a.id, { type: "ADAPTIVE_WEAKNESS" }, profileLearner(WEAK_A), { now: new Date(start.getTime() + (d + 1) * DAY), rng: mulberry32(32 + d) });
  const after = await prisma.studentSkillState.findMany({ where: { userId: b.id }, orderBy: [{ level: "asc" }, { nodeId: "asc" }], select: { nodeId: true, masteryScore: true, attempts: true, state: true } });
  const same = JSON.stringify(before) === JSON.stringify(after);
  return { id: "L-profile", title: "A second student's learning profile stays independent", passed: same, evidence: [`Student B's ${before.length} skill states were ${same ? "unchanged" : "CHANGED"} after student A completed 3 mocks.`] };
}
