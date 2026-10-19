import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExamConfig } from "@/lib/exam-config";
import { parseCsv, parseCsvImport, parseJsonImport, parsePdfText } from "@/lib/questions/parsers";
import { detectFormat } from "@/lib/server/upload";
import { loadConfigFile, lookupFromConfig } from "@/lib/server/syllabus";

const raw = JSON.parse(readFileSync("data/exam-config/mp-police-constable-2026.json", "utf8"));
const lookup = lookupFromConfig(loadConfigFile());
const subj = (t: string) => lookup.subjectOfTopic(t);

describe("exam configuration", () => {
  it("parses the shipped, versioned configuration", () => {
    const cfg = parseExamConfig(raw);
    expect(cfg.version).toBeTruthy();
    expect(cfg.pattern).toMatchObject({ totalQuestions: 100, totalMarks: 100, durationMinutes: 120, negativeMarking: false });
    expect(cfg.sections.reduce((a, s) => a + s.questions, 0)).toBe(100);
  });
  it("rejects a configuration whose sections do not add up", () => {
    const bad = structuredClone(raw);
    bad.sections[0].questions += 5;
    expect(() => parseExamConfig(bad)).toThrow(/Section questions/);
  });
  it("rejects a negative-marking flag that disagrees with the marks", () => {
    const bad = structuredClone(raw);
    bad.pattern.marking.incorrect = -0.25;
    expect(() => parseExamConfig(bad)).toThrow(/negativeMarking/);
  });
  it("accepts a new version with negative marking when it is consistent", () => {
    const next = structuredClone(raw);
    next.version = "test-negative";
    next.pattern.marking.incorrect = -0.25;
    next.pattern.negativeMarking = true;
    expect(parseExamConfig(next).pattern.marking.incorrect).toBe(-0.25);
  });
  it("rejects duplicate syllabus ids", () => {
    const bad = structuredClone(raw);
    bad.syllabus[0].topics[1].id = bad.syllabus[0].topics[0].id;
    expect(() => parseExamConfig(bad)).toThrow(/Duplicate/);
  });
});

describe("parsers", () => {
  it("parses quoted CSV fields with commas, quotes and newlines", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
  });
  it("imports the sample CSV and reports the row without an answer through validation", () => {
    const r = parseCsvImport(readFileSync("data/samples/questions-sample.csv", "utf8"), subj);
    expect(r.questions).toHaveLength(3);
    expect(r.questions.every((q) => q.verificationStatus === "PENDING_REVIEW")).toBe(true);
    expect(r.questions[2].correctOption).toBe("");
  });
  it("imports JSON with options as an array", () => {
    const r = parseJsonImport(readFileSync("data/samples/questions-sample.json", "utf8"), subj);
    expect(r.questions[0].options.map((o) => o.text)).toEqual(["5 km", "7 km", "1 km", "12 km"]);
    expect(r.questions[0].sourceId).toBe("sample-synthetic-source");
  });
  it("extracts numbered MCQs from PDF text and never guesses missing answers", () => {
    const text = "1. Capital of MP?\n(A) Indore (B) Bhopal (C) Gwalior (D) Jabalpur\n2. 2 + 2 = ?\n(A) 3 (B) 4 (C) 5 (D) 6\nAnswer Key\n1-B";
    const r = parsePdfText(text, "gk-mp", subj);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]).toMatchObject({ correctOption: "B", verificationStatus: "PENDING_REVIEW", origin: "SOURCE_MATERIAL" });
    expect(r.unresolved[0]).toMatchObject({ ref: "Q2" });
  });
});

describe("upload type checks", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("accepts matching name and content", () => {
    expect(detectFormat("x.pdf", enc("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectFormat("x.json", enc('{"questions":[]}'))).toBe("json");
    expect(detectFormat("x.csv", enc("a,b\n1,2"))).toBe("csv");
  });
  it("rejects disguised or unsupported files", () => {
    expect(() => detectFormat("x.pdf", enc("not a pdf"))).toThrow();
    expect(() => detectFormat("x.json", enc("%PDF-1.4"))).toThrow();
    expect(() => detectFormat("x.csv", new Uint8Array([0x4d, 0x5a, 0, 0]))).toThrow();
    expect(() => detectFormat("x.exe", enc("hello"))).toThrow();
  });
});
