import { describe, expect, it } from "vitest";
import { contradictsAnswer, offlineTutor, practiceVariant } from "@/lib/server/tutor";

const q = {
  id: "q1", stem: "What is 20% of 150?", stemHi: null, correctOption: "B", explanation: "20% of 150 = 30.", explanationHi: "150 का 20% = 30.",
  options: [{ key: "A" as const, text: "20", rationale: "Took 20% of 100 instead of 150.", misconception: "WRONG_BASE" }, { key: "B" as const, text: "30" }, { key: "C" as const, text: "15" }, { key: "D" as const, text: "300" }],
  generator: "template:pct-of@seed1", topicName: "Percentage", conceptNote: "Percent means per hundred.",
};

describe("offline tutor", () => {
  it("explains the verified answer and the student's distractor", () => {
    const r = offlineTutor(q, "A", "EN", 5);
    expect(r.provider).toBe("offline");
    expect(r.correctOption).toBe("B");
    expect(r.whyYourAnswer).toMatch(/Took 20% of 100/);
    expect(r.conceptNote).toBe("Percent means per hundred.");
  });
  it("answers in Hindi when asked and a translation exists", () => {
    expect(offlineTutor(q, "A", "HI", 5).explanation).toMatch(/का/);
  });
  it("creates a fresh practice variant with a computed answer", () => {
    const p = practiceVariant(q.generator, 99)!;
    expect(p.options.map((o) => o.key)).toContain(p.correctOption);
    expect(p.note).toMatch(/Not an official question/);
    expect(practiceVariant(null, 1)).toBeNull();
  });
});

describe("AI answer guard", () => {
  it("detects an explanation that names a different option as correct", () => {
    expect(contradictsAnswer("The correct answer is C because...", "B")).toBe(true);
    expect(contradictsAnswer("The correct option is (B).", "B")).toBe(false);
    expect(contradictsAnswer("Option C is a common trap.", "B")).toBe(false);
  });
});
