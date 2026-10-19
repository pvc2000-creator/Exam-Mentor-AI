import { describe, expect, it } from "vitest";
import { clampTime, scoreItems, type ScorableItem } from "@/lib/engine/scoring";

const item = (selected: string | null, correct = "B", topicId = "t1", subjectId = "s1", timeSpentMs = 30_000): ScorableItem => ({ questionId: Math.random().toString(36), subjectId, topicId, correctOption: correct, selectedOption: selected, timeSpentMs });

describe("scoreItems", () => {
  it("scores the configured MP Police scheme (+1 / 0 / 0)", () => {
    const r = scoreItems([item("B"), item("A"), item(null), item("B")], { correct: 1, incorrect: 0, unanswered: 0 });
    expect(r).toMatchObject({ score: 2, maxScore: 4, correct: 2, incorrect: 1, unanswered: 1, attempted: 3, percentage: 50 });
    expect(r.accuracy).toBeCloseTo(2 / 3);
  });

  it("applies negative marking when a scheme configures it", () => {
    const r = scoreItems([item("B"), item("A"), item("C"), item(null)], { correct: 1, incorrect: -0.25, unanswered: 0 });
    expect(r.score).toBe(0.5);
    expect(r.perQuestion.map((p) => p.marks)).toEqual([1, -0.25, -0.25, 0]);
  });

  it("treats empty strings as unanswered and never rewards them", () => {
    const r = scoreItems([item(""), item(null)], { correct: 1, incorrect: -1, unanswered: 0 });
    expect(r.unanswered).toBe(2);
    expect(r.score).toBe(0);
    expect(r.accuracy).toBeNull();
  });

  it("breaks results down by subject and topic", () => {
    const r = scoreItems([item("B", "B", "t1", "s1"), item("A", "B", "t2", "s1"), item("B", "B", "t3", "s2")], { correct: 1, incorrect: 0, unanswered: 0 });
    expect(r.bySubject.s1).toMatchObject({ correct: 1, incorrect: 1, maxScore: 2 });
    expect(r.bySubject.s2).toMatchObject({ correct: 1, maxScore: 1 });
    expect(r.byTopic.t2.accuracy).toBe(0);
  });

  it("rejects a scheme that rewards wrong answers", () => {
    expect(() => scoreItems([item("A")], { correct: 1, incorrect: 0.5, unanswered: 0 })).toThrow();
  });

  it("sums response time and ignores negative times", () => {
    const r = scoreItems([item("B", "B", "t1", "s1", 10_000), item("B", "B", "t1", "s1", -5)], { correct: 1, incorrect: 0, unanswered: 0 });
    expect(r.timeMs).toBe(10_000);
  });
});

describe("clampTime", () => {
  it("clamps client-reported time to the wall-clock elapsed time", () => {
    expect(clampTime(90_000, 60_000)).toBe(60_000);
    expect(clampTime(-10, 60_000)).toBe(0);
    expect(clampTime(Number.NaN, 60_000)).toBe(0);
    expect(clampTime(12_345.6, 60_000)).toBe(12_346);
  });
});
