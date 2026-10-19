/**
 * Topic/subtopic mastery estimation.
 *
 * Model: a Beta–Bernoulli estimate of the probability of answering a new question on the skill
 * correctly. Each response contributes a weight that combines
 *   - recency   (exponential decay, half-life `recencyHalfLifeDays`), so old evidence fades,
 *   - difficulty (a correct HARD answer is stronger evidence than a correct EASY one; an incorrect
 *     EASY answer is stronger evidence of a gap than an incorrect HARD one),
 *   - unanswered questions count as partial evidence against.
 * The posterior mean is the mastery score; the posterior spread gives a confidence value, so a topic
 * with one correct answer has a high-ish mean but very low confidence and is never "mastered".
 *
 * Mastery itself is a gate, not a score threshold: enough attempts on enough distinct questions,
 * high recent accuracy, success at MEDIUM/HARD, acceptable speed, and a retention check after an
 * interval. See docs/learning-engine.md.
 */
import type { LearningPolicy } from "./policy";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type MasteryStateT = "NOT_STARTED" | "INSUFFICIENT_DATA" | "WEAK" | "DEVELOPING" | "PROFICIENT" | "MASTERED" | "NEEDS_REVIEW";

export interface ResponseEvent {
  questionId: string;
  skillKey: string;
  difficulty: Difficulty;
  isCorrect: boolean | null; // null = unanswered
  timeSpentMs: number;
  expectedTimeSec: number;
  at: Date;
  misconception?: string | null;
}

export interface GateProgress {
  attempts: { have: number; need: number; ok: boolean };
  distinctQuestions: { have: number; need: number; ok: boolean };
  distinctCorrect: { have: number; need: number; ok: boolean };
  recentAccuracy: { have: number | null; need: number; ok: boolean };
  correctAtMediumOrHard: { have: number; need: number; ok: boolean };
  masteryScore: { have: number; need: number; ok: boolean };
  speed: { slowShare: number; max: number; ok: boolean };
  retention: { dueAt: string | null; passedAt: string | null; ok: boolean };
}

export interface SkillMetrics {
  attempts: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  distinctQuestions: number;
  accuracy: number;
  smoothedAccuracy: number;
  recentAccuracy: number | null;
  difficultyAdjusted: number;
  medianTimeMs: number | null;
  p25TimeMs: number | null;
  p75TimeMs: number | null;
  slowShare: number;
  repeatedMistakes: number;
  masteryScore: number;
  confidence: number;
  trend: number | null;
  lastPracticedAt: Date | null;
  masteredAt: Date | null;
  retentionDueAt: Date | null;
  retentionPassedAt: Date | null;
  state: MasteryStateT;
  stateReason: string;
  nextAction: string;
  gate: GateProgress;
}

const DAY = 86_400_000;

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/** Weighted Beta posterior over the given events. Exposed for tests. */
export function betaEstimate(events: ResponseEvent[], policy: LearningPolicy, now: Date) {
  let a = policy.prior.alpha;
  let b = policy.prior.beta;
  for (const e of events) {
    const ageDays = Math.max(0, (now.getTime() - e.at.getTime()) / DAY);
    const rec = Math.pow(0.5, ageDays / policy.recencyHalfLifeDays);
    const dw = policy.difficultyWeight[e.difficulty];
    if (e.isCorrect === true) a += rec * dw;
    else if (e.isCorrect === false) b += rec / dw;
    else b += rec * policy.unansweredWeight;
  }
  const mean = a / (a + b);
  const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
  const uniformSd = Math.sqrt(1 / 12);
  const confidence = Math.max(0, Math.min(1, 1 - sd / uniformSd));
  return { mean, sd, confidence, alpha: a, beta: b };
}

interface GateEval {
  ok: boolean;
  gate: Omit<GateProgress, "retention">;
}

function evaluateGates(events: ResponseEvent[], policy: LearningPolicy, now: Date): GateEval & { score: number; recentAcc: number | null; slowShare: number } {
  const m = policy.mastery;
  const answered = events.filter((e) => e.isCorrect !== null);
  const distinct = new Set(events.map((e) => e.questionId)).size;
  const distinctCorrect = new Set(events.filter((e) => e.isCorrect).map((e) => e.questionId)).size;
  const recent = events.slice(-policy.recentWindow);
  const recentAcc = recent.length ? recent.filter((e) => e.isCorrect).length / recent.length : null;
  const medHard = events.filter((e) => e.isCorrect && e.difficulty !== "EASY").length;
  const slow = answered.filter((e) => e.timeSpentMs > policy.slowFactor * e.expectedTimeSec * 1000).length;
  const slowShare = answered.length ? slow / answered.length : 0;
  const { mean } = betaEstimate(events, policy, now);
  const gate = {
    attempts: { have: events.length, need: m.minAttempts, ok: events.length >= m.minAttempts },
    distinctQuestions: { have: distinct, need: m.minDistinctQuestions, ok: distinct >= m.minDistinctQuestions },
    distinctCorrect: { have: distinctCorrect, need: m.minDistinctCorrect, ok: distinctCorrect >= m.minDistinctCorrect },
    recentAccuracy: { have: recentAcc, need: m.minRecentAccuracy, ok: recentAcc !== null && recent.length >= Math.min(policy.recentWindow, m.minAttempts) && recentAcc >= m.minRecentAccuracy },
    correctAtMediumOrHard: { have: medHard, need: m.minCorrectAtMediumOrHard, ok: medHard >= m.minCorrectAtMediumOrHard },
    masteryScore: { have: Math.round(mean * 1000) / 1000, need: m.minMasteryScore, ok: mean >= m.minMasteryScore },
    speed: { slowShare: Math.round(slowShare * 1000) / 1000, max: m.maxSlowShare, ok: slowShare <= m.maxSlowShare },
  };
  return { ok: Object.values(gate).every((g) => g.ok), gate, score: mean, recentAcc, slowShare };
}

/**
 * Computes the full learning state for one skill node from its chronological response history.
 * Pure and deterministic given `now`, so it can be replayed for audits and tests.
 */
export function computeSkillState(eventsIn: ResponseEvent[], policy: LearningPolicy, now: Date): SkillMetrics {
  const events = [...eventsIn].sort((x, y) => x.at.getTime() - y.at.getTime());
  const attempts = events.length;
  const correct = events.filter((e) => e.isCorrect === true).length;
  const incorrect = events.filter((e) => e.isCorrect === false).length;
  const unanswered = attempts - correct - incorrect;
  const answered = events.filter((e) => e.isCorrect !== null);
  const times = answered.map((e) => e.timeSpentMs).sort((a, b) => a - b);
  const { mean, confidence } = betaEstimate(events, policy, now);

  // Difficulty-adjusted accuracy: correct answers weighted by difficulty over total weight.
  let dwSum = 0;
  let dwCorrect = 0;
  for (const e of events) {
    const w = policy.difficultyWeight[e.difficulty];
    dwSum += w;
    if (e.isCorrect) dwCorrect += w;
  }

  // Repeated mistakes: the same question missed twice, or the same misconception seen twice.
  const wrongByQ = new Map<string, number>();
  const wrongByMis = new Map<string, number>();
  for (const e of events)
    if (e.isCorrect === false) {
      wrongByQ.set(e.questionId, (wrongByQ.get(e.questionId) ?? 0) + 1);
      if (e.misconception) wrongByMis.set(e.misconception, (wrongByMis.get(e.misconception) ?? 0) + 1);
    }
  const repeatedMistakes = [...wrongByQ.values()].filter((n) => n >= 2).length + [...wrongByMis.values()].filter((n) => n >= 2).length;

  const recent = events.slice(-policy.recentWindow);
  const older = events.slice(0, -policy.recentWindow);
  const recentAccuracy = recent.length ? recent.filter((e) => e.isCorrect).length / recent.length : null;
  const olderAcc = older.length >= 3 ? older.filter((e) => e.isCorrect).length / older.length : null;
  const trend = recentAccuracy !== null && olderAcc !== null ? recentAccuracy - olderAcc : null;

  // Replay history to find when the (non-retention) gates were first met, and whether a retention
  // check after the interval succeeded.
  let candidateSince: Date | null = null;
  let retentionPassedAt: Date | null = null;
  let masteredAt: Date | null = null;
  for (let i = 0; i < events.length; i++) {
    const prefix = events.slice(0, i + 1);
    const at = events[i].at;
    const g = evaluateGates(prefix, policy, at);
    if (!g.ok) {
      // Losing the gates before retention resets the candidacy; after mastery we handle decay below.
      if (!masteredAt) candidateSince = null;
      continue;
    }
    if (!candidateSince) candidateSince = at;
    const dueAt = candidateSince.getTime() + policy.mastery.retentionIntervalDays * DAY;
    if (!masteredAt && at.getTime() >= dueAt && events[i].isCorrect) {
      retentionPassedAt = at;
      masteredAt = at;
    }
  }
  const current = evaluateGates(events, policy, now);
  const retentionDueAt = candidateSince && !retentionPassedAt ? new Date(candidateSince.getTime() + policy.mastery.retentionIntervalDays * DAY) : null;
  const lastPracticedAt = events.length ? events[events.length - 1].at : null;
  const daysIdle = lastPracticedAt ? (now.getTime() - lastPracticedAt.getTime()) / DAY : Infinity;

  let state: MasteryStateT;
  let reason: string;
  let next: string;
  const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
  if (attempts === 0) {
    state = "NOT_STARTED";
    reason = "No questions attempted yet.";
    next = "Take a diagnostic or practice set to establish a baseline.";
  } else if (attempts < policy.minAttemptsForEstimate) {
    state = "INSUFFICIENT_DATA";
    reason = `Only ${attempts} attempt${attempts === 1 ? "" : "s"}; at least ${policy.minAttemptsForEstimate} are needed before judging this topic.`;
    next = "Answer a few more varied questions on this topic.";
  } else if (masteredAt && (recentAccuracy !== null && recentAccuracy < policy.decay.lossRecentAccuracy)) {
    state = "NEEDS_REVIEW";
    reason = `Was mastered, but recent accuracy fell to ${pct(recentAccuracy)} (below ${pct(policy.decay.lossRecentAccuracy)}).`;
    next = "Revise the concept note and complete a targeted practice set.";
  } else if (masteredAt && daysIdle > policy.decay.reviewAfterDays) {
    state = "NEEDS_REVIEW";
    reason = `Mastered earlier but not practised for ${Math.floor(daysIdle)} days; a retention check is due.`;
    next = "Take a short revision set to confirm you still remember it.";
  } else if (masteredAt && current.ok) {
    state = "MASTERED";
    reason = `All mastery gates met and retention confirmed after ${policy.mastery.retentionIntervalDays} days.`;
    next = "Maintain with occasional mixed and revision questions.";
  } else if (masteredAt) {
    // Mastered earlier; gates now partly unmet but accuracy not collapsed: keep practising.
    state = "PROFICIENT";
    reason = "Previously mastered; some gates are currently unmet, so the topic stays in rotation.";
    next = "Answer harder, varied questions to re-confirm mastery.";
  } else if (current.ok && candidateSince) {
    state = "PROFICIENT";
    reason = `All gates met; a retention check is due ${retentionDueAt ? `after ${retentionDueAt.toISOString().slice(0, 10)}` : "soon"} before this counts as mastered.`;
    next = "Return to this topic after the revision interval for a retention check.";
  } else if (mean < policy.weakThreshold || (recentAccuracy !== null && recentAccuracy < 0.5 && attempts >= policy.minAttemptsForEstimate)) {
    state = "WEAK";
    reason = `Estimated mastery ${pct(mean)} and recent accuracy ${pct(recentAccuracy)}.`;
    next = "Read the concept note, then practise foundational questions with feedback after each answer.";
  } else {
    state = "DEVELOPING";
    const GATE_LABEL: Record<string, string> = { attempts: "more answers", distinctQuestions: "more different questions", distinctCorrect: "more different questions answered correctly", recentAccuracy: "higher recent accuracy", correctAtMediumOrHard: "more correct answers at medium or hard difficulty", masteryScore: "a higher mastery estimate", speed: "fewer slow answers" };
    const unmet = Object.entries(current.gate).filter(([, g]) => !g.ok).map(([k]) => GATE_LABEL[k] ?? k);
    reason = `Estimated mastery ${pct(mean)}; still needed: ${unmet.join(", ") || "more evidence"}.`;
    next = mean >= policy.proficientThreshold ? "Attempt MEDIUM and HARD questions to prove mastery." : "Keep practising varied questions at intermediate difficulty.";
  }

  return {
    attempts, correct, incorrect, unanswered,
    distinctQuestions: new Set(events.map((e) => e.questionId)).size,
    accuracy: attempts ? correct / attempts : 0,
    smoothedAccuracy: (correct + policy.prior.alpha) / (attempts + policy.prior.alpha + policy.prior.beta),
    recentAccuracy,
    difficultyAdjusted: dwSum ? dwCorrect / dwSum : 0,
    medianTimeMs: quantile(times, 0.5),
    p25TimeMs: quantile(times, 0.25),
    p75TimeMs: quantile(times, 0.75),
    slowShare: current.slowShare,
    repeatedMistakes,
    masteryScore: mean,
    confidence,
    trend,
    lastPracticedAt,
    masteredAt,
    retentionDueAt,
    retentionPassedAt,
    state,
    stateReason: reason,
    nextAction: next,
    gate: {
      ...current.gate,
      retention: { dueAt: retentionDueAt?.toISOString() ?? null, passedAt: retentionPassedAt?.toISOString() ?? null, ok: !!retentionPassedAt },
    },
  };
}
