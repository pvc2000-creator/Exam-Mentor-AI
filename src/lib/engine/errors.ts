/**
 * Evidence-based error classification.
 *
 * Each rule adds a score to a candidate category and records the evidence it used. The winner's
 * score becomes its confidence (0–1). Below `TENTATIVE_BELOW` the diagnosis is shown as "possible"
 * and is never treated as an established pattern; patterns require recurrence across responses
 * (see summariseErrorPatterns).
 */
export type ErrorCategoryT =
  | "CONCEPTUAL"
  | "KNOWLEDGE_GAP"
  | "CALCULATION"
  | "MISREAD"
  | "RULE_MISAPPLICATION"
  | "GUESSING"
  | "RUSHED"
  | "TIME_MANAGEMENT"
  | "UNCLASSIFIED";

export const TENTATIVE_BELOW = 0.6;

/** Misconception tags (attached to distractors) mapped to the error category they indicate. */
export const MISCONCEPTION_CATEGORY: Record<string, ErrorCategoryT> = {
  WRONG_BASE: "CONCEPTUAL",
  SIMPLE_ADDITION: "CONCEPTUAL",
  CANCELLATION: "CONCEPTUAL",
  USED_SIMPLE: "CONCEPTUAL",
  AVERAGED_TIMES: "CONCEPTUAL",
  ADDED_TIMES: "CONCEPTUAL",
  SIMPLE_AVERAGE: "CONCEPTUAL",
  GEOMETRIC_MEAN: "CONCEPTUAL",
  LEFT_TO_RIGHT: "CONCEPTUAL",
  IGNORED_DISCOUNT: "CONCEPTUAL",
  NO_UNIT_CONVERSION: "CONCEPTUAL",
  INVERTED_CONVERSION: "CONCEPTUAL",
  HCF_NOT_LCM: "CONCEPTUAL",
  PRODUCT: "CONCEPTUAL",
  LCM_OVER_HCF: "CONCEPTUAL",
  INVERTED_FORMULA: "CONCEPTUAL",
  RATIO_AS_FRACTION: "CONCEPTUAL",
  DIVIDED_BY_PART: "CONCEPTUAL",
  CONSTANT_DIFF_ASSUMED: "CONCEPTUAL",
  MULTIPLIED_FUTURE_AGE: "CONCEPTUAL",
  MIXED_TIME_POINTS: "CONCEPTUAL",
  NO_DIFFERENCE: "CONCEPTUAL",
  IGNORED_HOUR_HAND_MOVEMENT: "CONCEPTUAL",
  NO_SHIFT: "CONCEPTUAL",
  ADDED_LEGS: "CONCEPTUAL",
  WRONG_RULE: "CONCEPTUAL",
  ADDED_DIFFERENCE: "CONCEPTUAL",
  SQUARE_FORMULA: "CONCEPTUAL",
  USED_DIAMETER: "CONCEPTUAL",
  ADDED_PERCENT: "CONCEPTUAL",
  ADDED: "CONCEPTUAL",
  DIVIDED: "CONCEPTUAL",
  SUBTRACTED: "CONCEPTUAL",
  SUBTRACTED_TIMES: "CONCEPTUAL",
  ADDED_ALL: "CONCEPTUAL",
  RATIO_NOT_PERCENT: "CONCEPTUAL",
  MEDIAN: "CONCEPTUAL",
  REVERSE_ALPHABET: "CONCEPTUAL",
  REVERSED: "CONCEPTUAL",
  MISSED_PROPERTY: "CONCEPTUAL",
  RELATION_CHAIN: "CONCEPTUAL",
  GAP_AS_ONE: "CONCEPTUAL",

  FORGOT_PLUS_ONE: "RULE_MISAPPLICATION",
  DOUBLE_COUNT: "RULE_MISAPPLICATION",
  ADDED_ONE: "RULE_MISAPPLICATION",
  LEAP_YEAR_RULE: "RULE_MISAPPLICATION",
  LEFT_RIGHT_SWAP: "RULE_MISAPPLICATION",
  WRONG_DIRECTION: "RULE_MISAPPLICATION",
  SIGN_ERROR: "RULE_MISAPPLICATION",
  WRONG_GROUPING: "RULE_MISAPPLICATION",
  FORGOT_TIME: "RULE_MISAPPLICATION",
  FORGOT_SELF: "RULE_MISAPPLICATION",
  IGNORED_OFFSET: "RULE_MISAPPLICATION",
  IGNORED_ADDEND: "RULE_MISAPPLICATION",
  IGNORED_RETURN_LEG: "RULE_MISAPPLICATION",
  WRONG_SHIFT: "RULE_MISAPPLICATION",
  OVERSHOT: "RULE_MISAPPLICATION",
  MISSING_SQUARE: "RULE_MISAPPLICATION",
  HALF_PERIMETER: "RULE_MISAPPLICATION",
  WRONG_COUNT: "RULE_MISAPPLICATION",
  DOUBLED: "RULE_MISAPPLICATION",
  PARTIAL: "RULE_MISAPPLICATION",
  SAME_RANK: "RULE_MISAPPLICATION",
  OFF_BY_ONE_POSITION: "RULE_MISAPPLICATION",

  NEAR_MISS: "CALCULATION",
  DECIMAL_SHIFT: "CALCULATION",
  OFF_BY_ONE: "CALCULATION",
  SINGLE_LETTER_SLIP: "CALCULATION",
  SKIPPED_TERM: "CALCULATION",
  MISSED_TURN: "CALCULATION",

  AMOUNT_NOT_INTEREST: "MISREAD",
  PROFIT_ONLY: "MISREAD",
  AREA_NOT_PERIMETER: "MISREAD",
  SUM_NOT_MEAN: "MISREAD",
  QUOTIENT_NOT_REMAINDER: "MISREAD",
  NEW_AVERAGE: "MISREAD",
  WRONG_PERSON: "MISREAD",
  PAST_AGE: "MISREAD",
  REFLEX_ANGLE: "MISREAD",
  WRONG_PART: "MISREAD",
  CIRCUMFERENCE: "MISREAD",
  ABSOLUTE_NOT_PERCENT: "MISREAD",
  TOTAL_PATH: "MISREAD",
  COMPLEMENT: "MISREAD",
  OPPOSITE: "MISREAD",
  SUM_CONFUSION: "MISREAD",
  ONE_YEAR_INTEREST: "MISREAD",
  MULTIPLE_NOT_LEAST: "MISREAD",
};

export interface ErrorContext {
  isCorrect: boolean | null;
  timeSpentMs: number;
  expectedTimeSec: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  isNumerical: boolean;
  misconception?: string | null;
  /** Student's median response time on this topic before this attempt (ms), if known. */
  studentMedianMs?: number | null;
  /** Student's accuracy on this topic before this attempt and how many attempts it is based on. */
  priorTopicAccuracy?: number | null;
  priorTopicAttempts?: number;
  /** Times this student previously chose the same misconception on this topic. */
  priorSameMisconception?: number;
  /** Whether the student answered this exact question / this skill correctly earlier. */
  previouslyCorrectSameQuestion?: boolean;
  previouslyCorrectSameSkill?: boolean;
  /** Optional self-reported confidence: 1 = guessing, 2 = unsure, 3 = sure. */
  selfConfidence?: number | null;
  answerChanges?: number;
}

export interface ErrorDiagnosis {
  category: ErrorCategoryT;
  confidence: number;
  tentative: boolean;
  evidence: string[];
  alternatives: Array<{ category: ErrorCategoryT; score: number }>;
}

export function classifyError(ctx: ErrorContext): ErrorDiagnosis | null {
  if (ctx.isCorrect === true) return null;
  const scores = new Map<ErrorCategoryT, number>();
  const evidence: string[] = [];
  const add = (c: ErrorCategoryT, s: number, why: string) => {
    scores.set(c, (scores.get(c) ?? 0) + s);
    evidence.push(why);
  };
  const expectedMs = ctx.expectedTimeSec * 1000;
  const ratio = expectedMs > 0 ? ctx.timeSpentMs / expectedMs : 1;
  const vsOwn = ctx.studentMedianMs ? ctx.timeSpentMs / ctx.studentMedianMs : null;
  const r1 = (x: number) => Math.round(x * 10) / 10;

  if (ctx.isCorrect === null) {
    if (ratio >= 1.5) add("TIME_MANAGEMENT", 0.55, `Left unanswered after ${r1(ratio)}× the expected solving time.`);
    else if (ctx.timeSpentMs < 3000) add("UNCLASSIFIED", 0.35, "Skipped without reading time; no evidence about the cause.");
    else add("KNOWLEDGE_GAP", 0.35, "Viewed but not answered within normal time; possibly did not know how to start.");
  } else {
    // 1. What the chosen distractor says.
    if (ctx.misconception && MISCONCEPTION_CATEGORY[ctx.misconception]) {
      const cat = MISCONCEPTION_CATEGORY[ctx.misconception];
      add(cat, cat === "CALCULATION" ? 0.4 : 0.5, `Chose the option produced by the '${ctx.misconception.toLowerCase().replace(/_/g, " ")}' mistake.`);
      if ((ctx.priorSameMisconception ?? 0) >= 1) add(cat, 0.2, `Same mistake made ${ctx.priorSameMisconception} time(s) before on this topic.`);
    } else if (!ctx.isNumerical) {
      add("KNOWLEDGE_GAP", 0.45, "Factual question answered incorrectly.");
    }
    // 2. Forgetting: previously correct on the same question or skill.
    if (ctx.previouslyCorrectSameQuestion) add("KNOWLEDGE_GAP", 0.2, "Answered this exact question correctly before (possible forgetting).");
    else if (ctx.previouslyCorrectSameSkill && !ctx.isNumerical) add("KNOWLEDGE_GAP", 0.1, "Answered other questions on this skill correctly before.");

    // 3. Speed signals relative to both the question benchmark and the student's own pace.
    const fastVsExpected = ratio < 0.35;
    const fastVsOwn = vsOwn !== null && vsOwn < 0.5;
    const priorGood = (ctx.priorTopicAccuracy ?? 0) >= 0.65 && (ctx.priorTopicAttempts ?? 0) >= 4;
    if (fastVsExpected && (fastVsOwn || vsOwn === null)) {
      if (priorGood || ctx.misconception === "NEAR_MISS" || ctx.misconception === "OFF_BY_ONE") {
        add("RUSHED", 0.35 + (fastVsOwn ? 0.15 : 0) + (priorGood ? 0.1 : 0), `Answered in ${r1(ratio)}× the expected time${vsOwn !== null ? ` and ${r1(vsOwn)}× own median` : ""}, on a topic usually answered well.`);
      } else if (ratio < 0.2) {
        add("GUESSING", 0.4, `Answered in only ${Math.round(ctx.timeSpentMs / 1000)} s with weak prior accuracy; may be a guess.`);
      } else {
        evidence.push(`Fast answer (${r1(ratio)}× expected) but prior performance does not suggest rushing.`);
      }
    }
    if (ratio > 2) add("TIME_MANAGEMENT", 0.25, `Spent ${r1(ratio)}× the expected time before answering incorrectly.`);

    // 4. Self-report and hesitation.
    if (ctx.selfConfidence === 1) add("GUESSING", 0.45, "Student marked this answer as a guess.");
    if (ctx.selfConfidence === 3 && ctx.misconception && MISCONCEPTION_CATEGORY[ctx.misconception] === "CONCEPTUAL")
      add("CONCEPTUAL", 0.15, "Student was sure of a wrong answer that matches a known misconception.");
    if ((ctx.answerChanges ?? 0) >= 2) add("GUESSING", 0.15, `Changed the answer ${ctx.answerChanges} times.`);
    if (ctx.difficulty === "HARD" && !ctx.misconception) add("CONCEPTUAL", 0.1, "Missed a HARD question.");
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { category: "UNCLASSIFIED", confidence: 0.3, tentative: true, evidence: evidence.length ? evidence : ["No distinguishing evidence."], alternatives: [] };
  const [top, score] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  // Close competition lowers confidence: we are less sure which cause applies.
  const confidence = Math.max(0.2, Math.min(0.9, score - Math.max(0, runnerUp - score * 0.5) * 0.5));
  return {
    category: top,
    confidence: Math.round(confidence * 100) / 100,
    tentative: confidence < TENTATIVE_BELOW,
    evidence,
    alternatives: ranked.slice(1, 3).map(([category, s]) => ({ category, score: Math.round(s * 100) / 100 })),
  };
}

export const ERROR_LABEL: Record<ErrorCategoryT, string> = {
  CONCEPTUAL: "Conceptual misunderstanding",
  KNOWLEDGE_GAP: "Knowledge gap or forgotten fact",
  CALCULATION: "Calculation or procedural slip",
  MISREAD: "Misread what was asked",
  RULE_MISAPPLICATION: "Rule applied incorrectly",
  GUESSING: "Guess or low-confidence answer",
  RUSHED: "Possibly rushed",
  TIME_MANAGEMENT: "Time-management issue",
  UNCLASSIFIED: "Not enough evidence",
};

/**
 * Aggregates diagnoses into patterns. A category is a "recurring" pattern only when it appears at least
 * twice with summed confidence ≥ 1.2; otherwise it is reported as "possible".
 */
export function summariseErrorPatterns(diags: Array<{ category: ErrorCategoryT; confidence: number }>) {
  const by = new Map<ErrorCategoryT, { count: number; weight: number }>();
  for (const d of diags) {
    const cur = by.get(d.category) ?? { count: 0, weight: 0 };
    cur.count++;
    cur.weight += d.confidence;
    by.set(d.category, cur);
  }
  return [...by.entries()]
    .map(([category, v]) => ({ category, count: v.count, weight: Math.round(v.weight * 100) / 100, status: v.count >= 2 && v.weight >= 1.2 ? ("recurring" as const) : ("possible" as const) }))
    .sort((a, b) => b.weight - a.weight);
}
