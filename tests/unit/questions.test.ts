import { describe, expect, it } from "vitest";
import { questionFingerprint, questionIdFromFingerprint, normaliseText } from "@/lib/questions/fingerprint";
import { validateQuestion, hasErrors } from "@/lib/questions/validate";
import { TEMPLATES, generateFromTemplate } from "@/lib/questions/templates";
import { templateQuestions } from "@/lib/questions/bank";
import { mulberry32 } from "@/lib/rng";
import { loadConfigFile, lookupFromConfig } from "@/lib/server/syllabus";
import type { QuestionInput } from "@/lib/questions/types";

const lookup = lookupFromConfig(loadConfigFile());
const q = (o: Partial<QuestionInput> = {}): QuestionInput => ({
  subjectId: "science-arithmetic", topicId: "ar-percentage", skillKey: "k", language: "EN", stem: "What is 10% of 50?",
  options: [{ key: "A", text: "5" }, { key: "B", text: "10" }, { key: "C", text: "50" }, { key: "D", text: "0.5" }], correctOption: "A",
  explanation: "10% of 50 = 50 × 0.1 = 5.", difficulty: "EASY", difficultyBasis: "rubric", expectedTimeSec: 30, isNumerical: true,
  origin: "HUMAN_AUTHORED", isSynthetic: true, verificationStatus: "PENDING_REVIEW", verificationMethod: "NONE", ...o,
});
const codes = (x: QuestionInput) => validateQuestion(x, lookup).map((i) => i.code);

describe("fingerprints", () => {
  it("ignores case, spacing, punctuation and option order", () => {
    const a = q();
    const b = q({ stem: "  what IS 10% of 50 ", options: [...q().options].reverse(), correctOption: "A" });
    expect(questionFingerprint(a)).toBe(questionFingerprint(b));
    expect(normaliseText("Hello,  World!")).toBe("hello world");
  });
  it("changes when the correct answer changes", () => {
    expect(questionFingerprint(q())).not.toBe(questionFingerprint(q({ correctOption: "B" })));
  });
  it("derives a deterministic id", () => {
    expect(questionIdFromFingerprint(questionFingerprint(q()))).toMatch(/^q_[0-9a-f]{20}$/);
  });
});

describe("validateQuestion", () => {
  it("accepts a well-formed question", () => expect(hasErrors(validateQuestion(q(), lookup))).toBe(false));
  it("rejects a missing answer", () => expect(codes(q({ correctOption: "" }))).toContain("ANSWER_MISSING"));
  it("rejects an answer that is not an option", () => expect(codes(q({ correctOption: "E" }))).toContain("ANSWER_INVALID"));
  it("rejects duplicate option text", () => expect(codes(q({ options: [{ key: "A", text: "5" }, { key: "B", text: "5" }, { key: "C", text: "1" }, { key: "D", text: "2" }] }))).toContain("OPTION_TEXT_DUPLICATE"));
  it("rejects an unknown topic and a subject mismatch", () => {
    expect(codes(q({ topicId: "nope" }))).toContain("TOPIC_UNKNOWN");
    expect(codes(q({ subjectId: "gk-reasoning" }))).toContain("SUBJECT_MISMATCH");
  });
  it("forbids labelling synthetic questions as official previous-year", () => expect(codes(q({ origin: "OFFICIAL_PREVIOUS_YEAR", sourceId: "x" }))).toContain("ORIGIN_CONFLICT"));
  it("forbids AI-authored questions verifying themselves", () => expect(codes(q({ origin: "AI_AUTHORED", verificationStatus: "VERIFIED", verificationMethod: "AUTOMATED_CHECKS" }))).toContain("SELF_VERIFIED"));
  it("flags a questionable explanation", () => expect(codes(q({ explanation: "Multiply and you get the answer." }))).toContain("EXPLANATION_MISMATCH"));
  it("flags 'all of the above' options", () => expect(codes(q({ options: [{ key: "A", text: "5" }, { key: "B", text: "All of the above" }, { key: "C", text: "1" }, { key: "D", text: "2" }] }))).toContain("AMBIGUOUS_OPTION"));
});

describe("templates", () => {
  it("every template produces valid questions whose stated answer is among four distinct options", () => {
    for (const t of TEMPLATES) {
      for (const v of generateFromTemplate(t, mulberry32, 1000, 5)) {
        const keys = v.options.map((o) => o.key);
        expect(keys).toContain(v.correctOption);
        expect(new Set(v.options.map((o) => o.text)).size).toBe(4);
        const input: QuestionInput = { ...q(), ...v, subjectId: t.subjectId, topicId: t.topicId, subtopicId: t.subtopicId, skillKey: t.skillKey, difficulty: t.difficulty, isNumerical: t.isNumerical };
        expect(hasErrors(validateQuestion(input, lookup)), `${t.id}: ${JSON.stringify(validateQuestion(input, lookup))}`).toBe(false);
      }
    }
  });
  it("generates the same bank on every run (deterministic ids)", () => {
    const a = templateQuestions(2).map(questionFingerprint);
    const b = templateQuestions(2).map(questionFingerprint);
    expect(a).toEqual(b);
  });
});
