/**
 * Rule-based recommendation engine. Works without any LLM. Every recommendation carries a reason built
 * from the student's own data.
 */
import type { MasteryStateT } from "./mastery";
import type { ErrorCategoryT } from "./errors";
import { ERROR_LABEL } from "./errors";

export interface RecTopic {
  topicId: string;
  name: string;
  state: MasteryStateT;
  masteryScore: number;
  confidence: number;
  attempts: number;
  accuracy: number;
  recentAccuracy: number | null;
  slowShare: number;
  repeatedMistakes: number;
  trend: number | null;
  retentionDueAt: Date | null;
  topErrors: Array<{ category: ErrorCategoryT; count: number; status: "recurring" | "possible" }>;
}

export interface RecommendationT {
  kind: "REVIEW_CONCEPT" | "TARGETED_PRACTICE" | "RETRY_SIMILAR" | "TIMED_DRILL" | "REVISE" | "MIXED_ASSESSMENT" | "REASSESS" | "DIAGNOSTIC";
  nodeId: string | null;
  title: string;
  reason: string;
  priority: number; // higher first
}

const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

export function buildRecommendations(topics: RecTopic[], ctx: { totalAttempts: number; now: Date; incorrectToRetry: number }): RecommendationT[] {
  const recs: RecommendationT[] = [];
  if (ctx.totalAttempts === 0) {
    recs.push({ kind: "DIAGNOSTIC", nodeId: null, title: "Take the diagnostic baseline test", reason: "You have not answered any questions yet. A short baseline across the syllabus lets the mentor find your strengths and gaps.", priority: 100 });
    return recs;
  }
  for (const t of topics) {
    const recurring = t.topErrors.filter((e) => e.status === "recurring");
    if (t.state === "WEAK") {
      const err = recurring[0];
      recs.push({ kind: "REVIEW_CONCEPT", nodeId: t.topicId, title: `Review the concept: ${t.name}`, reason: `Estimated mastery is ${pct(t.masteryScore)} after ${t.attempts} attempts${err ? `; most mistakes look like "${ERROR_LABEL[err.category].toLowerCase()}" (${err.count} times)` : ""}.`, priority: 90 - Math.round(t.masteryScore * 20) });
      recs.push({ kind: "TARGETED_PRACTICE", nodeId: t.topicId, title: `Practise ${t.name} with instant feedback`, reason: `Recent accuracy ${pct(t.recentAccuracy)}. Foundational questions with feedback after each answer will rebuild the method before harder ones.`, priority: 85 - Math.round(t.masteryScore * 20) });
    } else if (t.state === "NEEDS_REVIEW") {
      recs.push({ kind: "REASSESS", nodeId: t.topicId, title: `Reassess ${t.name}`, reason: `You had mastered this topic, but ${t.recentAccuracy !== null && t.recentAccuracy < 0.6 ? `recent accuracy fell to ${pct(t.recentAccuracy)}` : "it has not been practised for a while"}.`, priority: t.recentAccuracy !== null && t.recentAccuracy < 0.6 ? 92 : 72 });
    } else if (t.repeatedMistakes >= 2) {
      recs.push({ kind: "RETRY_SIMILAR", nodeId: t.topicId, title: `Retry different questions on ${t.name}`, reason: `${t.repeatedMistakes} mistakes have repeated on this topic. New questions testing the same skill will show whether the fix has stuck.`, priority: 75 });
    }
    if (t.slowShare > 0.4 && t.attempts >= 5) {
      recs.push({ kind: "TIMED_DRILL", nodeId: t.topicId, title: `Timed drill: ${t.name}`, reason: `${pct(t.slowShare)} of your answers took more than 1.5× the expected time. In a 120-minute paper that time is taken from other questions.`, priority: 60 });
    }
    const rushed = t.topErrors.find((e) => e.category === "RUSHED" && e.status === "recurring");
    if (rushed) recs.push({ kind: "TIMED_DRILL", nodeId: t.topicId, title: `Slow down on ${t.name}`, reason: `${rushed.count} wrong answers were much faster than your usual pace on a topic you usually get right. Re-read the question before choosing.`, priority: 58 });
    if (t.state === "PROFICIENT" && t.retentionDueAt && t.retentionDueAt <= ctx.now) {
      recs.push({ kind: "REVISE", nodeId: t.topicId, title: `Retention check: ${t.name}`, reason: "You met every mastery gate at least one revision interval ago. Answering correctly now will confirm mastery.", priority: 70 });
    } else if (t.state === "DEVELOPING" && (t.trend ?? 0) > 0.1) {
      recs.push({ kind: "TARGETED_PRACTICE", nodeId: t.topicId, title: `Confirm your progress on ${t.name}`, reason: `Accuracy is up ${Math.round((t.trend ?? 0) * 100)} points recently; a few harder questions will confirm it.`, priority: 55 });
    }
  }
  if (ctx.incorrectToRetry > 0)
    recs.push({ kind: "RETRY_SIMILAR", nodeId: null, title: "Review your recent mistakes", reason: `${ctx.incorrectToRetry} question(s) answered incorrectly have explanations waiting, plus fresh questions on the same skills.`, priority: 65 });
  const untested = topics.filter((t) => t.state === "NOT_STARTED" || t.state === "INSUFFICIENT_DATA").length;
  if (untested > 0) recs.push({ kind: "MIXED_ASSESSMENT", nodeId: null, title: "Take a mixed-syllabus mock", reason: `${untested} topic(s) have too little data to judge. A mixed mock covers them.`, priority: 50 });
  recs.push({ kind: "MIXED_ASSESSMENT", nodeId: null, title: "Take your next personalised mock", reason: "Built from your current learning profile: weak topics get more questions, mastered topics get revision questions.", priority: 45 });
  // De-duplicate by (kind,node), keep highest priority.
  const seen = new Map<string, RecommendationT>();
  for (const r of recs) {
    const k = `${r.kind}:${r.nodeId}`;
    if (!seen.has(k) || seen.get(k)!.priority < r.priority) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => b.priority - a.priority).slice(0, 12);
}
