import { describe, expect, it } from "vitest";
import { allocateMock, apportion, categorise, type TopicMeta, type TopicProfile } from "@/lib/engine/allocation";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { loadConfigFile } from "@/lib/server/syllabus";

const cfg = loadConfigFile();
const topics: TopicMeta[] = cfg.syllabus.flatMap((s) => s.topics.map((t) => ({ id: t.id, subjectId: s.id, name: t.name, weight: t.weight })));
const now = new Date("2026-06-01T00:00:00Z");
const prof = (topicId: string, o: Partial<TopicProfile>): TopicProfile => ({ topicId, state: "DEVELOPING", masteryScore: 0.6, confidence: 0.5, attempts: 10, repeatedMistakes: 0, slowShare: 0.1, trend: 0, retentionDueAt: null, ...o });
const sum = (xs: Array<{ count: number }>) => xs.reduce((a, x) => a + x.count, 0);

describe("apportion", () => {
  it("distributes exactly n items by weight", () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(7, [0, 1])).toEqual([0, 7]);
    expect(apportion(5, [0, 0])).toEqual([0, 0]);
  });
});

describe("allocateMock", () => {
  it("honours section totals and covers every topic in a full-length mock", () => {
    const slots = allocateMock({ type: "FULL_LENGTH", totalQuestions: 100, topics, profiles: new Map(), policy: DEFAULT_POLICY, now, sections: cfg.sections });
    expect(sum(slots)).toBe(100);
    for (const sec of cfg.sections) expect(sum(slots.filter((s) => topics.find((t) => t.id === s.topicId)!.subjectId === sec.subjectId))).toBe(sec.questions);
    expect(new Set(slots.map((s) => s.topicId)).size).toBe(topics.length);
  });

  it("gives weak topics more slots than mastered ones in a personalised mock", () => {
    const profiles = new Map(topics.map((t) => [t.id, prof(t.id, { state: "MASTERED", masteryScore: 0.9 })]));
    profiles.set("ar-percentage", prof("ar-percentage", { state: "WEAK", masteryScore: 0.25 }));
    profiles.set("gk-mp", prof("gk-mp", { state: "WEAK", masteryScore: 0.3, repeatedMistakes: 3 }));
    const slots = allocateMock({ type: "ADAPTIVE_WEAKNESS", totalQuestions: 30, topics, profiles, policy: DEFAULT_POLICY, now });
    expect(sum(slots)).toBe(30);
    const get = (id: string) => slots.find((s) => s.topicId === id);
    expect(get("ar-percentage")!.category).toBe("REMEDIATION");
    expect(get("gk-mp")!.category).toBe("REPEATED_ERRORS");
    const mastered = slots.filter((s) => s.category === "MAINTENANCE");
    for (const m of mastered) expect(m.count).toBeLessThan(get("ar-percentage")!.count);
  });

  it("caps any one topic's share", () => {
    const profiles = new Map(topics.map((t) => [t.id, prof(t.id, { state: "MASTERED", masteryScore: 0.95 })]));
    profiles.set("ar-percentage", prof("ar-percentage", { state: "WEAK", masteryScore: 0.05 }));
    const slots = allocateMock({ type: "ADAPTIVE_WEAKNESS", totalQuestions: 30, topics, profiles, policy: DEFAULT_POLICY, now });
    expect(slots.find((s) => s.topicId === "ar-percentage")!.count).toBeLessThanOrEqual(Math.ceil(30 * DEFAULT_POLICY.maxTopicShare));
  });

  it("produces different allocations for different profiles", () => {
    const a = new Map([["ar-percentage", prof("ar-percentage", { state: "WEAK", masteryScore: 0.2 })]]);
    const b = new Map([["gk-history", prof("gk-history", { state: "WEAK", masteryScore: 0.2 })]]);
    const sa = allocateMock({ type: "ADAPTIVE_WEAKNESS", totalQuestions: 30, topics, profiles: a, policy: DEFAULT_POLICY, now });
    const sb = allocateMock({ type: "ADAPTIVE_WEAKNESS", totalQuestions: 30, topics, profiles: b, policy: DEFAULT_POLICY, now });
    const ca = (s: typeof sa, id: string) => s.find((x) => x.topicId === id)?.count ?? 0;
    expect(ca(sa, "ar-percentage")).toBeGreaterThan(ca(sb, "ar-percentage"));
    expect(ca(sb, "gk-history")).toBeGreaterThan(ca(sa, "gk-history"));
  });

  it("follows the configurable policy shares", () => {
    const profiles = new Map([["ar-percentage", prof("ar-percentage", { state: "WEAK", masteryScore: 0.2 })]]);
    const noRemediation = { ...DEFAULT_POLICY, categoryShares: { ...DEFAULT_POLICY.categoryShares, ADAPTIVE_WEAKNESS: { COVERAGE: 1 } } };
    const slots = allocateMock({ type: "ADAPTIVE_WEAKNESS", totalQuestions: 30, topics, profiles, policy: noRemediation, now });
    expect(slots.find((s) => s.topicId === "ar-percentage")).toBeUndefined();
  });

  it("puts a topic whose mastery collapsed back into active practice", () => {
    expect(categorise(prof("x", { state: "NEEDS_REVIEW", recentAccuracy: 0.2 }), now, DEFAULT_POLICY).category).toBe("REMEDIATION");
    expect(categorise(prof("x", { state: "NEEDS_REVIEW", recentAccuracy: 0.9 }), now, DEFAULT_POLICY).category).toBe("SPACED_REVISION");
    expect(categorise(prof("x", { state: "MASTERED" }), now, DEFAULT_POLICY).category).toBe("MAINTENANCE");
  });

  it("restricts a revision mock to learned topics", () => {
    const profiles = new Map([["gk-computer", prof("gk-computer", { state: "MASTERED", masteryScore: 0.9 })], ["ar-ratio", prof("ar-ratio", { state: "PROFICIENT", masteryScore: 0.8, retentionDueAt: new Date(now.getTime() - 1) })]]);
    const slots = allocateMock({ type: "REVISION", totalQuestions: 10, topics, profiles, policy: DEFAULT_POLICY, now });
    expect(new Set(slots.map((s) => s.topicId))).toEqual(new Set(["gk-computer", "ar-ratio"]));
    expect(sum(slots)).toBe(10);
  });
});
