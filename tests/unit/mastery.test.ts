import { describe, expect, it } from "vitest";
import { computeSkillState, betaEstimate, type ResponseEvent } from "@/lib/engine/mastery";
import { DEFAULT_POLICY } from "@/lib/engine/policy";

const DAY = 86_400_000;
const t0 = new Date("2026-05-01T08:00:00Z").getTime();
let n = 0;
const ev = (isCorrect: boolean | null, dayOffset: number, o: Partial<ResponseEvent> = {}): ResponseEvent => ({
  questionId: `q${n++}`, skillKey: "s", difficulty: "MEDIUM", isCorrect, timeSpentMs: 30_000, expectedTimeSec: 45, at: new Date(t0 + dayOffset * DAY), ...o,
});

describe("computeSkillState", () => {
  it("does not judge a topic from one correct answer", () => {
    const s = computeSkillState([ev(true, 0)], DEFAULT_POLICY, new Date(t0));
    expect(s.state).toBe("INSUFFICIENT_DATA");
    expect(s.confidence).toBeLessThan(0.5);
  });

  it("never declares mastery from one perfect score on the same question", () => {
    const evs = Array.from({ length: 10 }, (_, i) => ev(true, i * 0.01, { questionId: "same" }));
    const s = computeSkillState(evs, DEFAULT_POLICY, new Date(t0 + DAY));
    expect(s.state).not.toBe("MASTERED");
    expect(s.gate.distinctQuestions.ok).toBe(false);
  });

  it("identifies a weak topic", () => {
    const s = computeSkillState([ev(false, 0), ev(false, 0), ev(true, 0), ev(false, 0), ev(null, 0)], DEFAULT_POLICY, new Date(t0));
    expect(s.state).toBe("WEAK");
  });

  it("requires a retention check after the interval before MASTERED", () => {
    const evs = Array.from({ length: 10 }, (_, i) => ev(true, i * 0.1, { difficulty: i % 2 ? "HARD" : "MEDIUM" }));
    const proficient = computeSkillState(evs, DEFAULT_POLICY, new Date(t0 + 2 * DAY));
    expect(proficient.state).toBe("PROFICIENT");
    expect(proficient.retentionDueAt).not.toBeNull();
    const later = [...evs, ev(true, 9, { difficulty: "MEDIUM" })];
    const mastered = computeSkillState(later, DEFAULT_POLICY, new Date(t0 + 9 * DAY));
    expect(mastered.state).toBe("MASTERED");
    expect(mastered.retentionPassedAt).not.toBeNull();
  });

  it("moves a mastered topic to NEEDS_REVIEW when recent accuracy drops", () => {
    const evs = [...Array.from({ length: 10 }, (_, i) => ev(true, i * 0.1, { difficulty: "HARD" })), ev(true, 9)];
    const decline = [...evs, ...Array.from({ length: 6 }, (_, i) => ev(false, 10 + i * 0.01))];
    const s = computeSkillState(decline, DEFAULT_POLICY, new Date(t0 + 11 * DAY));
    expect(s.state).toBe("NEEDS_REVIEW");
  });

  it("moves a mastered topic to NEEDS_REVIEW after a long idle period", () => {
    const evs = [...Array.from({ length: 10 }, (_, i) => ev(true, i * 0.1, { difficulty: "HARD" })), ev(true, 9)];
    expect(computeSkillState(evs, DEFAULT_POLICY, new Date(t0 + 50 * DAY)).state).toBe("NEEDS_REVIEW");
  });

  it("computes median response time and slow share", () => {
    const evs = [ev(true, 0, { timeSpentMs: 10_000 }), ev(true, 0, { timeSpentMs: 20_000 }), ev(false, 0, { timeSpentMs: 90_000 })];
    const s = computeSkillState(evs, DEFAULT_POLICY, new Date(t0));
    expect(s.medianTimeMs).toBe(20_000);
    expect(s.slowShare).toBeCloseTo(1 / 3);
  });
});

describe("betaEstimate", () => {
  it("weights recent answers more than old ones", () => {
    const now = new Date(t0 + 100 * DAY);
    const oldWrongNewRight = [...Array.from({ length: 5 }, () => ev(false, 0)), ...Array.from({ length: 5 }, () => ev(true, 99))];
    const oldRightNewWrong = [...Array.from({ length: 5 }, () => ev(true, 0)), ...Array.from({ length: 5 }, () => ev(false, 99))];
    expect(betaEstimate(oldWrongNewRight, DEFAULT_POLICY, now).mean).toBeGreaterThan(betaEstimate(oldRightNewWrong, DEFAULT_POLICY, now).mean);
  });

  it("gains confidence with more evidence", () => {
    const now = new Date(t0);
    const few = betaEstimate([ev(true, 0), ev(false, 0)], DEFAULT_POLICY, now).confidence;
    const many = betaEstimate(Array.from({ length: 40 }, (_, i) => ev(i % 2 === 0, 0)), DEFAULT_POLICY, now).confidence;
    expect(many).toBeGreaterThan(few);
  });
});
