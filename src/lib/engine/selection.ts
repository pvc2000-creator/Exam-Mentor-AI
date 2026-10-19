/**
 * Question selection for allocated slots.
 *
 * Preferences, in order: eligible verification status → unseen questions → questions testing a skill the
 * student got wrong (but not the same question) → target difficulty for the topic's state → variety of
 * skills within the mock. Choices are deterministic for a given seed. When a topic runs out of eligible
 * questions the shortage is recorded and the slot is filled from the same section, never with
 * ineligible (unverified) questions.
 */
import { mulberry32 } from "../rng";
import type { LearningPolicy, SlotCategory } from "./policy";
import type { Slot } from "./allocation";
import type { Difficulty, MasteryStateT } from "./mastery";

export interface CandidateQuestion {
  id: string;
  topicId: string;
  subtopicId: string | null;
  subjectId: string;
  skillKey: string;
  difficulty: Difficulty;
}

export interface Exposure {
  timesSeen: number;
  lastSeenAt: Date;
  lastCorrect: boolean | null;
}

export interface SelectionInput {
  slots: Slot[];
  pool: CandidateQuestion[];
  exposure: Map<string, Exposure>;
  wrongSkills: Set<string>; // skills with a recent wrong answer
  topicStates: Map<string, MasteryStateT>;
  policy: LearningPolicy;
  seed: number;
  now: Date;
  diagnostic?: boolean;
}

export interface SelectedQuestion {
  questionId: string;
  topicId: string;
  slotCategory: SlotCategory | "FALLBACK";
  reason: string;
  previouslySeen: boolean;
}

export interface Shortage {
  topicId: string;
  requested: number;
  filled: number;
  note: string;
}

const DAY = 86_400_000;

export function difficultyQuota(n: number, targets: Partial<Record<Difficulty, number>>): Record<Difficulty, number> {
  const keys: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
  const w = keys.map((k) => targets[k] ?? 0);
  const total = w.reduce((s, x) => s + x, 0) || 1;
  const raw = w.map((x) => (x / total) * n);
  const base = raw.map(Math.floor);
  let left = n - base.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0; k++, left--) base[order[k % 3].i]++;
  return { EASY: base[0], MEDIUM: base[1], HARD: base[2] };
}

export function selectQuestions(input: SelectionInput): { selected: SelectedQuestion[]; shortages: Shortage[] } {
  const rng = mulberry32(input.seed);
  const used = new Set<string>();
  const skillUse = new Map<string, number>();
  const selected: SelectedQuestion[] = [];
  const shortages: Shortage[] = [];
  const byTopic = new Map<string, CandidateQuestion[]>();
  for (const q of input.pool) {
    const arr = byTopic.get(q.topicId) ?? [];
    arr.push(q);
    byTopic.set(q.topicId, arr);
  }
  // Stable, seeded tie-breaker per question.
  const jitter = new Map(input.pool.map((q) => [q.id, rng()]));

  const score = (q: CandidateQuestion, wantDiff: Difficulty | null, category: SlotCategory) => {
    const ex = input.exposure.get(q.id);
    let s = 0;
    if (!ex) s += 100;
    else {
      const days = (input.now.getTime() - ex.lastSeenAt.getTime()) / DAY;
      s += Math.min(60, days * 2) - ex.timesSeen * 5;
      if (days < input.policy.recentExposureDays) s -= 80;
      // Spaced revision may reuse an old question the student got right; remediation never repeats a miss verbatim.
      if (category === "SPACED_REVISION" && ex.lastCorrect) s += 10;
      if (ex.lastCorrect === false) s -= 20;
    }
    if (wantDiff && q.difficulty === wantDiff) s += 25;
    if ((category === "REMEDIATION" || category === "REPEATED_ERRORS") && input.wrongSkills.has(q.skillKey)) s += 30;
    s -= (skillUse.get(q.skillKey) ?? 0) * 12;
    return s + (jitter.get(q.id) ?? 0) * 5;
  };

  const take = (cands: CandidateQuestion[], wantDiff: Difficulty | null, category: SlotCategory) => {
    let best: CandidateQuestion | null = null;
    let bestScore = -Infinity;
    for (const q of cands) {
      if (used.has(q.id)) continue;
      const s = score(q, wantDiff, category);
      if (s > bestScore) { bestScore = s; best = q; }
    }
    return best;
  };

  for (const slot of input.slots) {
    const cands = byTopic.get(slot.topicId) ?? [];
    const state = input.topicStates.get(slot.topicId) ?? "NOT_STARTED";
    const targets = input.diagnostic ? input.policy.difficultyTargets.DIAGNOSTIC : input.policy.difficultyTargets[state] ?? input.policy.difficultyTargets.DEVELOPING;
    const quota = difficultyQuota(slot.count, targets);
    const wants: Difficulty[] = [];
    (["EASY", "MEDIUM", "HARD"] as Difficulty[]).forEach((d) => { for (let i = 0; i < quota[d]; i++) wants.push(d); });
    let filled = 0;
    for (const d of wants) {
      const q = take(cands, d, slot.category);
      if (!q) break;
      used.add(q.id);
      skillUse.set(q.skillKey, (skillUse.get(q.skillKey) ?? 0) + 1);
      const seen = input.exposure.has(q.id);
      selected.push({ questionId: q.id, topicId: q.topicId, slotCategory: slot.category, reason: slot.reason + (q.difficulty !== d ? ` (no unused ${d.toLowerCase()} question available; used ${q.difficulty.toLowerCase()})` : ""), previouslySeen: seen });
      filled++;
    }
    const unseenAvailable = cands.filter((c) => !input.exposure.has(c.id)).length;
    if (filled < slot.count || unseenAvailable < slot.count) {
      shortages.push({
        topicId: slot.topicId,
        requested: slot.count,
        filled,
        note: filled < slot.count ? `Only ${filled} eligible question(s) available; ${slot.count - filled} slot(s) filled from the same section.` : `Only ${unseenAvailable} unseen question(s); some previously seen questions were reused (least recent first).`,
      });
    }
    // Fill the gap from the same subject, never from ineligible questions.
    const subjectId = cands[0]?.subjectId ?? input.pool.find((p) => p.topicId === slot.topicId)?.subjectId;
    for (let k = filled; k < slot.count; k++) {
      const alt = take(input.pool.filter((p) => !subjectId || p.subjectId === subjectId), null, "COVERAGE");
      if (!alt) break;
      used.add(alt.id);
      skillUse.set(alt.skillKey, (skillUse.get(alt.skillKey) ?? 0) + 1);
      selected.push({ questionId: alt.id, topicId: alt.topicId, slotCategory: "FALLBACK", reason: `Filler: not enough eligible questions on the planned topic.`, previouslySeen: input.exposure.has(alt.id) });
    }
  }
  return { selected, shortages };
}
