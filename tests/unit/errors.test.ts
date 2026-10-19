import { describe, expect, it } from "vitest";
import { classifyError, summariseErrorPatterns, TENTATIVE_BELOW, type ErrorContext } from "@/lib/engine/errors";

const base: ErrorContext = { isCorrect: false, timeSpentMs: 40_000, expectedTimeSec: 45, difficulty: "MEDIUM", isNumerical: true };

describe("classifyError", () => {
  it("returns nothing for a correct answer", () => {
    expect(classifyError({ ...base, isCorrect: true })).toBeNull();
  });

  it("uses the chosen distractor's misconception as evidence", () => {
    const d = classifyError({ ...base, misconception: "WRONG_BASE" })!;
    expect(d.category).toBe("CONCEPTUAL");
    expect(d.evidence.join(" ")).toMatch(/wrong base/);
  });

  it("does not call a fast wrong answer 'rushed' without supporting history", () => {
    const d = classifyError({ ...base, timeSpentMs: 8_000, misconception: "WRONG_BASE", priorTopicAccuracy: 0.3, priorTopicAttempts: 6 })!;
    expect(d.category).not.toBe("RUSHED");
  });

  it("flags a possible rushed error when fast versus both benchmarks on a topic usually answered well", () => {
    const d = classifyError({ ...base, timeSpentMs: 8_000, misconception: "NEAR_MISS", studentMedianMs: 35_000, priorTopicAccuracy: 0.85, priorTopicAttempts: 10 })!;
    expect(d.category).toBe("RUSHED");
    expect(d.alternatives.length).toBeGreaterThan(0);
  });

  it("marks low-evidence diagnoses as tentative", () => {
    const d = classifyError({ ...base, isCorrect: null, timeSpentMs: 1_000 })!;
    expect(d.confidence).toBeLessThan(TENTATIVE_BELOW);
    expect(d.tentative).toBe(true);
  });

  it("treats a long unanswered question as a time-management issue", () => {
    expect(classifyError({ ...base, isCorrect: null, timeSpentMs: 120_000 })!.category).toBe("TIME_MANAGEMENT");
  });

  it("raises confidence when the same misconception recurs", () => {
    const once = classifyError({ ...base, misconception: "FORGOT_PLUS_ONE" })!;
    const again = classifyError({ ...base, misconception: "FORGOT_PLUS_ONE", priorSameMisconception: 2 })!;
    expect(again.category).toBe("RULE_MISAPPLICATION");
    expect(again.confidence).toBeGreaterThan(once.confidence);
  });

  it("uses self-reported guessing", () => {
    expect(classifyError({ ...base, isNumerical: false, selfConfidence: 1, misconception: null })!.category).toMatch(/GUESSING|KNOWLEDGE_GAP/);
  });
});

describe("summariseErrorPatterns", () => {
  it("calls a pattern recurring only with repeated, confident evidence", () => {
    const one = summariseErrorPatterns([{ category: "CONCEPTUAL", confidence: 0.9 }]);
    expect(one[0].status).toBe("possible");
    const weak = summariseErrorPatterns([{ category: "RUSHED", confidence: 0.3 }, { category: "RUSHED", confidence: 0.3 }]);
    expect(weak[0].status).toBe("possible");
    const strong = summariseErrorPatterns([{ category: "CONCEPTUAL", confidence: 0.7 }, { category: "CONCEPTUAL", confidence: 0.6 }]);
    expect(strong[0].status).toBe("recurring");
  });
});
