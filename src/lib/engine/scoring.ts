/**
 * Scoring against the configured marking scheme. Uses the correct-option snapshot stored with the mock,
 * so later edits to the question bank never change a historical result.
 */
export interface MarkingSchemeT {
  correct: number;
  incorrect: number; // 0 or negative
  unanswered: number;
}

export interface ScorableItem {
  questionId: string;
  subjectId: string;
  topicId: string;
  correctOption: string;
  selectedOption: string | null;
  timeSpentMs: number;
}

export interface Breakdown {
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  score: number;
  maxScore: number;
  accuracy: number | null; // correct / attempted
  timeMs: number;
}

export interface ScoreResult extends Breakdown {
  percentage: number;
  bySubject: Record<string, Breakdown>;
  byTopic: Record<string, Breakdown>;
  perQuestion: Array<{ questionId: string; isCorrect: boolean | null; marks: number }>;
}

const empty = (): Breakdown => ({ attempted: 0, correct: 0, incorrect: 0, unanswered: 0, score: 0, maxScore: 0, accuracy: null, timeMs: 0 });

export function scoreItems(items: ScorableItem[], scheme: MarkingSchemeT): ScoreResult {
  if (scheme.incorrect > 0) throw new Error("Marks for an incorrect answer cannot be positive");
  const total = empty();
  const bySubject: Record<string, Breakdown> = {};
  const byTopic: Record<string, Breakdown> = {};
  const perQuestion: ScoreResult["perQuestion"] = [];
  for (const it of items) {
    const answered = it.selectedOption !== null && it.selectedOption !== "";
    const isCorrect = answered ? it.selectedOption === it.correctOption : null;
    const marks = isCorrect === null ? scheme.unanswered : isCorrect ? scheme.correct : scheme.incorrect;
    perQuestion.push({ questionId: it.questionId, isCorrect, marks });
    for (const b of [total, (bySubject[it.subjectId] ??= empty()), (byTopic[it.topicId] ??= empty())]) {
      b.maxScore += scheme.correct;
      b.score += marks;
      b.timeMs += Math.max(0, it.timeSpentMs);
      if (isCorrect === null) b.unanswered++;
      else {
        b.attempted++;
        if (isCorrect) b.correct++;
        else b.incorrect++;
      }
    }
  }
  for (const b of [total, ...Object.values(bySubject), ...Object.values(byTopic)]) {
    b.accuracy = b.attempted ? b.correct / b.attempted : null;
    b.score = Math.round(b.score * 100) / 100;
  }
  return { ...total, percentage: total.maxScore ? Math.round((total.score / total.maxScore) * 10000) / 100 : 0, bySubject, byTopic, perQuestion };
}

/** Server-side clamp for client-reported time: never negative, never more than wall-clock elapsed. */
export function clampTime(reportedMs: number, maxMs: number): number {
  if (!Number.isFinite(reportedMs) || reportedMs < 0) return 0;
  return Math.min(Math.round(reportedMs), Math.max(0, Math.round(maxMs)));
}
