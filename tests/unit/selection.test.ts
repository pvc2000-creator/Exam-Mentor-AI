import { describe, expect, it } from "vitest";
import { selectQuestions, difficultyQuota, type CandidateQuestion } from "@/lib/engine/selection";
import { DEFAULT_POLICY } from "@/lib/engine/policy";

const now = new Date("2026-06-01T00:00:00Z");
const pool: CandidateQuestion[] = [];
for (const topicId of ["t1", "t2"])
  for (let i = 0; i < 12; i++) pool.push({ id: `${topicId}-q${i}`, topicId, subtopicId: null, subjectId: "s", skillKey: `${topicId}-skill${i % 4}`, difficulty: (["EASY", "MEDIUM", "HARD"] as const)[i % 3] });

describe("selectQuestions", () => {
  it("is deterministic for a seed and never repeats a question within a mock", () => {
    const input = { slots: [{ topicId: "t1", count: 8, category: "REMEDIATION" as const, reason: "r" }, { topicId: "t2", count: 8, category: "COVERAGE" as const, reason: "r" }], pool, exposure: new Map(), wrongSkills: new Set<string>(), topicStates: new Map(), policy: DEFAULT_POLICY, seed: 7, now };
    const a = selectQuestions(input);
    const b = selectQuestions(input);
    expect(a.selected.map((s) => s.questionId)).toEqual(b.selected.map((s) => s.questionId));
    expect(new Set(a.selected.map((s) => s.questionId)).size).toBe(16);
  });

  it("prefers unseen questions and avoids recently seen ones", () => {
    const exposure = new Map(pool.filter((q) => q.topicId === "t1").slice(0, 6).map((q) => [q.id, { timesSeen: 1, lastSeenAt: new Date(now.getTime() - 86_400_000), lastCorrect: false }]));
    const r = selectQuestions({ slots: [{ topicId: "t1", count: 6, category: "REMEDIATION", reason: "r" }], pool, exposure, wrongSkills: new Set(), topicStates: new Map(), policy: DEFAULT_POLICY, seed: 1, now });
    expect(r.selected.every((s) => !s.previouslySeen)).toBe(true);
  });

  it("targets skills the student got wrong with different questions", () => {
    const wrong = pool.find((q) => q.skillKey === "t1-skill1")!;
    const exposure = new Map([[wrong.id, { timesSeen: 1, lastSeenAt: now, lastCorrect: false }]]);
    const r = selectQuestions({ slots: [{ topicId: "t1", count: 3, category: "REMEDIATION", reason: "r" }], pool, exposure, wrongSkills: new Set(["t1-skill1"]), topicStates: new Map([["t1", "WEAK"]]), policy: DEFAULT_POLICY, seed: 3, now });
    const chosen = r.selected.map((s) => pool.find((q) => q.id === s.questionId)!);
    expect(chosen.some((q) => q.skillKey === "t1-skill1")).toBe(true);
    expect(chosen.some((q) => q.id === wrong.id)).toBe(false);
  });

  it("records a shortage and fills from the same subject instead of failing", () => {
    const small = pool.filter((q) => q.topicId === "t2" || q.id === "t1-q0");
    const r = selectQuestions({ slots: [{ topicId: "t1", count: 4, category: "REMEDIATION", reason: "r" }], pool: small, exposure: new Map(), wrongSkills: new Set(), topicStates: new Map(), policy: DEFAULT_POLICY, seed: 1, now });
    expect(r.shortages[0]).toMatchObject({ topicId: "t1", requested: 4, filled: 1 });
    expect(r.selected.filter((s) => s.slotCategory === "FALLBACK")).toHaveLength(3);
  });

  it("uses easier questions for weak topics", () => {
    expect(difficultyQuota(10, DEFAULT_POLICY.difficultyTargets.WEAK)).toEqual({ EASY: 6, MEDIUM: 4, HARD: 0 });
    const r = selectQuestions({ slots: [{ topicId: "t1", count: 4, category: "REMEDIATION", reason: "r" }], pool, exposure: new Map(), wrongSkills: new Set(), topicStates: new Map([["t1", "WEAK"]]), policy: DEFAULT_POLICY, seed: 9, now });
    const diffs = r.selected.map((s) => pool.find((q) => q.id === s.questionId)!.difficulty);
    expect(diffs.filter((d) => d === "HARD")).toHaveLength(0);
  });
});
