/**
 * Learning-engine policy. Every threshold the engine uses lives here so it can be tuned, documented
 * (docs/learning-engine.md) and tested. A policy is versioned and recorded in each generated mock.
 */
export type SlotCategory =
  | "REMEDIATION" // weak topics
  | "REPEATED_ERRORS" // topics with recurring mistakes
  | "SPEED_ACCURACY" // suspected speed/accuracy issues
  | "CONFIRMATION" // recently improved, needs confirming
  | "SPACED_REVISION" // learned topics due for a retention check
  | "MAINTENANCE" // strong/mastered topics
  | "COVERAGE"; // untested or under-tested syllabus areas, and exam-pattern coverage

export interface LearningPolicy {
  version: string;
  prior: { alpha: number; beta: number };
  recencyHalfLifeDays: number;
  difficultyWeight: Record<"EASY" | "MEDIUM" | "HARD", number>;
  unansweredWeight: number;
  minAttemptsForEstimate: number;
  recentWindow: number;
  weakThreshold: number;
  proficientThreshold: number;
  mastery: {
    minAttempts: number;
    minDistinctQuestions: number;
    minDistinctCorrect: number;
    minRecentAccuracy: number;
    minCorrectAtMediumOrHard: number;
    minMasteryScore: number;
    maxSlowShare: number;
    retentionIntervalDays: number;
  };
  decay: { reviewAfterDays: number; lossRecentAccuracy: number };
  slowFactor: number; // time > slowFactor × expected counts as slow
  categoryShares: Record<string, Partial<Record<SlotCategory, number>>>;
  maxTopicShare: number; // cap on any single topic's share of a personalised mock
  difficultyTargets: Record<string, Partial<Record<"EASY" | "MEDIUM" | "HARD", number>>>;
  recentExposureDays: number; // a question seen within this window is avoided when alternatives exist
}

export const DEFAULT_POLICY: LearningPolicy = {
  version: "policy-2026.10.1",
  prior: { alpha: 1, beta: 1 },
  recencyHalfLifeDays: 21,
  difficultyWeight: { EASY: 0.8, MEDIUM: 1.0, HARD: 1.25 },
  unansweredWeight: 0.5,
  minAttemptsForEstimate: 3,
  recentWindow: 8,
  weakThreshold: 0.5,
  proficientThreshold: 0.7,
  mastery: {
    minAttempts: 8,
    minDistinctQuestions: 6,
    minDistinctCorrect: 5,
    minRecentAccuracy: 0.8,
    minCorrectAtMediumOrHard: 3,
    minMasteryScore: 0.72,
    maxSlowShare: 0.4,
    retentionIntervalDays: 7,
  },
  decay: { reviewAfterDays: 30, lossRecentAccuracy: 0.6 },
  slowFactor: 1.5,
  categoryShares: {
    ADAPTIVE_WEAKNESS: { REMEDIATION: 0.35, REPEATED_ERRORS: 0.4, SPEED_ACCURACY: 0.2, CONFIRMATION: 0.15, SPACED_REVISION: 0.2, MAINTENANCE: 0.03, COVERAGE: 0.12 },
    FULL_LENGTH: { REMEDIATION: 0.2, REPEATED_ERRORS: 0.1, SPEED_ACCURACY: 0.05, CONFIRMATION: 0.1, SPACED_REVISION: 0.1, MAINTENANCE: 0.1, COVERAGE: 0.35 },
    SUBJECT: { REMEDIATION: 0.3, REPEATED_ERRORS: 0.1, SPEED_ACCURACY: 0.1, CONFIRMATION: 0.1, SPACED_REVISION: 0.1, MAINTENANCE: 0.1, COVERAGE: 0.2 },
    MIXED: { REMEDIATION: 0.15, REPEATED_ERRORS: 0.05, CONFIRMATION: 0.1, SPACED_REVISION: 0.1, MAINTENANCE: 0.15, COVERAGE: 0.45 },
    REVISION: { SPACED_REVISION: 0.5, MAINTENANCE: 0.3, CONFIRMATION: 0.2 },
    SPEED_DRILL: { SPEED_ACCURACY: 0.6, CONFIRMATION: 0.2, MAINTENANCE: 0.2 },
    TOPIC_PRACTICE: { REMEDIATION: 1 },
    DIAGNOSTIC: { COVERAGE: 1 },
  },
  maxTopicShare: 0.3,
  difficultyTargets: {
    NOT_STARTED: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 },
    INSUFFICIENT_DATA: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 },
    WEAK: { EASY: 0.6, MEDIUM: 0.4 },
    DEVELOPING: { EASY: 0.2, MEDIUM: 0.6, HARD: 0.2 },
    PROFICIENT: { MEDIUM: 0.5, HARD: 0.5 },
    MASTERED: { MEDIUM: 0.4, HARD: 0.6 },
    NEEDS_REVIEW: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 },
    DIAGNOSTIC: { EASY: 0.34, MEDIUM: 0.33, HARD: 0.33 },
  },
  recentExposureDays: 3,
};

export function mergePolicy(overrides?: Partial<LearningPolicy>): LearningPolicy {
  if (!overrides) return DEFAULT_POLICY;
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    mastery: { ...DEFAULT_POLICY.mastery, ...(overrides.mastery ?? {}) },
    decay: { ...DEFAULT_POLICY.decay, ...(overrides.decay ?? {}) },
  };
}
