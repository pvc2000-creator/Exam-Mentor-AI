/**
 * Topic allocation for a mock. Decides how many questions each topic gets and why, from the student's
 * topic-level learning states, the mock type and the exam blueprint.
 *
 * 1. Each topic is assigned one slot category from its state (weak → REMEDIATION, etc.).
 * 2. The mock type's category shares act as priorities: each topic's weight is share(category) × need ×
 *    √(blueprint weight), so the mix follows the student's needs (no weak topics → no remediation slots).
 * 3. Slots are apportioned over topics by weight (largest remainder).
 * 4. A per-topic cap prevents over-fitting to one topic; full-length mocks honour section totals and
 *    give every topic in a section at least one question when the count allows.
 */
import type { LearningPolicy, SlotCategory } from "./policy";
import type { MasteryStateT } from "./mastery";

export type MockTypeT = "FULL_LENGTH" | "SUBJECT" | "TOPIC_PRACTICE" | "ADAPTIVE_WEAKNESS" | "SPEED_DRILL" | "REVISION" | "MIXED" | "DIAGNOSTIC";

export interface TopicMeta {
  id: string;
  subjectId: string;
  name: string;
  weight: number;
}

export interface TopicProfile {
  topicId: string;
  state: MasteryStateT;
  masteryScore: number;
  confidence: number;
  attempts: number;
  repeatedMistakes: number;
  slowShare: number;
  rushedCount?: number; // recurring RUSHED diagnoses
  trend: number | null;
  retentionDueAt: Date | null;
  recentAccuracy?: number | null;
}

export interface Slot {
  topicId: string;
  count: number;
  category: SlotCategory;
  reason: string;
}

export interface AllocationInput {
  type: MockTypeT;
  totalQuestions: number;
  topics: TopicMeta[];
  profiles: Map<string, TopicProfile>;
  policy: LearningPolicy;
  now: Date;
  sections?: Array<{ subjectId: string; questions: number }>;
}

export function categorise(p: TopicProfile | undefined, now: Date, policy: LearningPolicy): { category: SlotCategory; need: number; reason: string } {
  if (!p || p.state === "NOT_STARTED") return { category: "COVERAGE", need: 0.7, reason: "Not attempted yet; included to measure your starting level." };
  const pct = Math.round(p.masteryScore * 100);
  if (p.state === "INSUFFICIENT_DATA") {
    // Too little evidence to judge, but early misses are followed up with more questions to confirm or rule out a gap.
    if (p.masteryScore < 0.5) return { category: "REMEDIATION", need: 0.9, reason: `Early sign of a gap (${p.attempts} attempt(s), mostly wrong). More questions will confirm or rule it out.` };
    return { category: "COVERAGE", need: 0.4, reason: `Only ${p.attempts} attempt(s) so far, answered well; a little more evidence is needed.` };
  }
  if (p.state === "WEAK") {
    if (p.repeatedMistakes >= 2) return { category: "REPEATED_ERRORS", need: 1.1, reason: `Weak (${pct}% estimated mastery) with ${p.repeatedMistakes} repeated mistakes.` };
    return { category: "REMEDIATION", need: 1 - p.masteryScore + 0.5, reason: `Weak topic: ${pct}% estimated mastery.` };
  }
  if (p.state === "NEEDS_REVIEW") {
    if (p.recentAccuracy !== undefined && p.recentAccuracy !== null && p.recentAccuracy < policy.decay.lossRecentAccuracy)
      return { category: "REMEDIATION", need: 1.2, reason: `Previously mastered, but recent accuracy fell to ${Math.round(p.recentAccuracy * 100)}%; back in active practice.` };
    return { category: "SPACED_REVISION", need: 0.9, reason: "Previously mastered but not practised recently; a retention check is due." };
  }
  if (p.repeatedMistakes >= 2) return { category: "REPEATED_ERRORS", need: 0.9, reason: `${p.repeatedMistakes} repeated mistakes on this topic.` };
  if (p.slowShare > policy.mastery.maxSlowShare || (p.rushedCount ?? 0) >= 2)
    return { category: "SPEED_ACCURACY", need: 0.8, reason: p.slowShare > policy.mastery.maxSlowShare ? `${Math.round(p.slowShare * 100)}% of answers were slower than 1.5× the expected time.` : "Several answers looked rushed." };
  if (p.state === "PROFICIENT") {
    if (p.retentionDueAt && p.retentionDueAt.getTime() <= now.getTime()) return { category: "SPACED_REVISION", need: 0.75, reason: "Retention check due: all mastery gates were met at least one revision interval ago." };
    return { category: "CONFIRMATION", need: 0.5, reason: `Strong (${pct}%); confirming with harder, varied questions.` };
  }
  if (p.state === "DEVELOPING") {
    if ((p.trend ?? 0) > 0.1) return { category: "CONFIRMATION", need: 0.7, reason: `Improving (+${Math.round((p.trend ?? 0) * 100)} points recently); confirming the improvement.` };
    return { category: "REMEDIATION", need: 1 - p.masteryScore + 0.2, reason: `Developing: ${pct}% estimated mastery, not yet consistent.` };
  }
  return { category: "MAINTENANCE", need: 0.2, reason: "Mastered: kept in rotation at low frequency for revision." };
}

/** Largest-remainder apportionment of n items by weights. */
export function apportion(n: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (n <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / total) * n);
  const base = raw.map(Math.floor);
  let left = n - base.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) base[order[k].i]++;
  return base;
}

function allocateWithin(n: number, topics: TopicMeta[], type: MockTypeT, input: AllocationInput, minPerTopic: number): Slot[] {
  if (n <= 0 || topics.length === 0) return [];
  const { policy, profiles, now } = input;
  const shares = policy.categoryShares[type] ?? policy.categoryShares.MIXED;
  const assigned = topics.map((t) => ({ t, ...categorise(profiles.get(t.id), now, policy) }));

  // Diagnostic and topic practice ignore categories: pure blueprint coverage / single topic.
  if (type === "DIAGNOSTIC" || type === "TOPIC_PRACTICE") {
    const counts = apportion(n, topics.map((t) => t.weight));
    return topics.map((t, i) => ({ topicId: t.id, count: counts[i], category: type === "DIAGNOSTIC" ? "COVERAGE" : "REMEDIATION", reason: type === "DIAGNOSTIC" ? "Baseline coverage in proportion to the syllabus." : "Topic you chose to practise." } as Slot)).filter((s) => s.count > 0);
  }

  const counts = new Map<string, number>(topics.map((t) => [t.id, 0]));
  const reasons = new Map<string, { category: SlotCategory; reason: string }>(assigned.map((a) => [a.t.id, { category: a.category, reason: a.reason }]));
  let remaining = n;
  // Exam-pattern coverage floor.
  if (minPerTopic > 0 && n >= topics.length * minPerTopic) {
    for (const t of topics) counts.set(t.id, minPerTopic);
    remaining -= topics.length * minPerTopic;
  }
  // Each topic's weight = category priority (the mock type's share for its category) × the topic's need ×
  // √(syllabus weight). Slots are apportioned over topics by weight, so a category with a single topic
  // does not hand that topic the whole category budget.
  let weights = assigned.map((a) => (shares[a.category] ?? 0) * a.need * Math.sqrt(a.t.weight));
  if (weights.every((w) => w <= 0)) weights = assigned.map((a) => a.need * Math.sqrt(a.t.weight)); // type's categories absent
  const cap = Math.max(minPerTopic + 1, Math.ceil(n * policy.maxTopicShare));
  const split = apportion(remaining, weights);
  let overflow = 0;
  assigned.forEach((a, i) => {
    const cur = counts.get(a.t.id)!;
    const give = Math.min(Math.max(0, cap - cur), split[i]);
    counts.set(a.t.id, cur + give);
    overflow += split[i] - give;
  });
  // Redistribute anything blocked by the cap, preferring higher-need topics.
  const byNeed = [...assigned].sort((a, b) => b.need - a.need);
  let guard = 0;
  while (overflow > 0 && guard++ < 10_000) {
    let placed = false;
    for (const a of byNeed) {
      if (overflow <= 0) break;
      if (counts.get(a.t.id)! < cap) {
        counts.set(a.t.id, counts.get(a.t.id)! + 1);
        overflow--;
        placed = true;
      }
    }
    if (!placed) {
      // Every topic is at the cap (very small syllabus slice); relax the cap.
      counts.set(byNeed[0].t.id, counts.get(byNeed[0].t.id)! + overflow);
      overflow = 0;
    }
  }
  return topics
    .map((t) => ({ topicId: t.id, count: counts.get(t.id)!, ...reasons.get(t.id)! }))
    .filter((s) => s.count > 0);
}

export function allocateMock(input: AllocationInput): Slot[] {
  const { type, totalQuestions, topics } = input;
  if (type === "FULL_LENGTH" && input.sections?.length) {
    return input.sections.flatMap((sec) => allocateWithin(sec.questions, topics.filter((t) => t.subjectId === sec.subjectId), type, input, 1));
  }
  let pool = topics;
  if (type === "SPEED_DRILL") {
    const flagged = topics.filter((t) => categorise(input.profiles.get(t.id), input.now, input.policy).category === "SPEED_ACCURACY");
    pool = flagged.length >= 2 ? flagged : topics.filter((t) => input.profiles.get(t.id)?.attempts);
    if (!pool.length) pool = topics;
  }
  if (type === "REVISION") {
    const learned = topics.filter((t) => ["PROFICIENT", "MASTERED", "NEEDS_REVIEW", "DEVELOPING"].includes(input.profiles.get(t.id)?.state ?? ""));
    if (learned.length) pool = learned;
  }
  return allocateWithin(totalQuestions, pool, type, input, type === "MIXED" ? 1 : 0);
}
