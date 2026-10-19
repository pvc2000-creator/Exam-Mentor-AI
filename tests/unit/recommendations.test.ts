import { describe, expect, it } from "vitest";
import { buildRecommendations, type RecTopic } from "@/lib/engine/recommendations";

const t = (o: Partial<RecTopic>): RecTopic => ({ topicId: "t", name: "Topic", state: "DEVELOPING", masteryScore: 0.6, confidence: 0.5, attempts: 10, accuracy: 0.6, recentAccuracy: 0.6, slowShare: 0.1, repeatedMistakes: 0, trend: 0, retentionDueAt: null, topErrors: [], ...o });
const now = new Date("2026-06-01T00:00:00Z");

describe("buildRecommendations", () => {
  it("starts a new student with the diagnostic", () => {
    const r = buildRecommendations([t({ state: "NOT_STARTED", attempts: 0 })], { totalAttempts: 0, now, incorrectToRetry: 0 });
    expect(r[0].kind).toBe("DIAGNOSTIC");
  });
  it("gives every recommendation a data-derived reason", () => {
    const r = buildRecommendations([t({ topicId: "a", name: "Percentage", state: "WEAK", masteryScore: 0.3, recentAccuracy: 0.25, topErrors: [{ category: "CONCEPTUAL", count: 3, status: "recurring" }] }), t({ topicId: "b", name: "Speed", slowShare: 0.6 })], { totalAttempts: 40, now, incorrectToRetry: 4 });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x.reason.length).toBeGreaterThan(20);
    expect(r.find((x) => x.nodeId === "a")!.reason).toMatch(/30%|conceptual/i);
    expect(r.some((x) => x.kind === "TIMED_DRILL" && x.nodeId === "b")).toBe(true);
  });
  it("ranks a collapsed mastered topic near the top", () => {
    const r = buildRecommendations([t({ topicId: "m", state: "NEEDS_REVIEW", recentAccuracy: 0.2 }), t({ topicId: "w", state: "WEAK", masteryScore: 0.4, recentAccuracy: 0.4 })], { totalAttempts: 50, now, incorrectToRetry: 0 });
    expect(r[0].nodeId).toBe("m");
  });
});
