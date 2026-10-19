import type { QuestionInput } from "./types";

export type IssueSeverity = "error" | "warning";
export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface SyllabusLookup {
  hasTopic(topicId: string): boolean;
  subjectOfTopic(topicId: string): string | undefined;
  topicOfSubtopic(subtopicId: string): string | undefined;
}

const ALLOWED_KEYS = ["A", "B", "C", "D", "E", "F"];

/**
 * Deterministic structural checks applied to every question before it can enter the bank.
 * Errors block import; warnings flag the question for review.
 */
export function validateQuestion(q: QuestionInput, syllabus: SyllabusLookup, expectedOptions = 4): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  if (!q.stem || q.stem.trim().length < 5) err("STEM_MISSING", "Question text is missing or too short");
  if (q.stem && q.stem.length > 2000) err("STEM_TOO_LONG", "Question text exceeds 2000 characters");
  if (!Array.isArray(q.options) || q.options.length < 2) err("OPTIONS_MISSING", "At least two options are required");
  else {
    if (q.options.length !== expectedOptions) warn("OPTION_COUNT", `Expected ${expectedOptions} options, found ${q.options.length}`);
    const keys = q.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) err("OPTION_KEYS_DUPLICATE", "Option keys must be unique");
    if (keys.some((k) => !ALLOWED_KEYS.includes(k))) err("OPTION_KEY_INVALID", "Option keys must be A-F");
    const texts = q.options.map((o) => (o.text ?? "").trim().toLowerCase());
    if (texts.some((t) => t.length === 0)) err("OPTION_EMPTY", "An option has no text");
    if (new Set(texts).size !== texts.length) err("OPTION_TEXT_DUPLICATE", "Two options have identical text (ambiguous)");
  }
  if (!q.correctOption) err("ANSWER_MISSING", "Correct answer is missing");
  else if (!q.options?.some((o) => o.key === q.correctOption)) err("ANSWER_INVALID", `Correct answer ${q.correctOption} is not one of the options`);

  if (!syllabus.hasTopic(q.topicId)) err("TOPIC_UNKNOWN", `Unknown topic ${q.topicId}`);
  else if (syllabus.subjectOfTopic(q.topicId) !== q.subjectId) err("SUBJECT_MISMATCH", `Topic ${q.topicId} does not belong to subject ${q.subjectId}`);
  if (q.subtopicId && syllabus.topicOfSubtopic(q.subtopicId) !== q.topicId) err("SUBTOPIC_MISMATCH", `Subtopic ${q.subtopicId} does not belong to topic ${q.topicId}`);

  if (!q.explanation || q.explanation.trim().length < 10) warn("EXPLANATION_MISSING", "No usable explanation");
  else {
    const correctText = q.options?.find((o) => o.key === q.correctOption)?.text;
    // Questionable explanation heuristic: a numeric answer whose value never appears in the explanation.
    if (q.isNumerical && correctText) {
      const num = correctText.replace(/[^0-9.]/g, "");
      if (num && !q.explanation.replace(/,/g, "").includes(num)) warn("EXPLANATION_MISMATCH", "Explanation does not mention the correct numeric answer");
    }
  }
  if (!Number.isFinite(q.expectedTimeSec) || q.expectedTimeSec < 5 || q.expectedTimeSec > 600)
    err("EXPECTED_TIME_INVALID", "Expected solving time must be between 5 and 600 seconds");
  if (q.origin === "OFFICIAL_PREVIOUS_YEAR" && !q.sourceId) err("SOURCE_MISSING", "Previous-year questions need a source reference");
  if (q.origin === "OFFICIAL_PREVIOUS_YEAR" && q.isSynthetic) err("ORIGIN_CONFLICT", "A synthetic question cannot be labelled as an official previous-year question");
  if (q.origin === "AI_AUTHORED" && q.verificationStatus === "VERIFIED" && q.verificationMethod !== "HUMAN_REVIEW" && q.verificationMethod !== "DETERMINISTIC_COMPUTATION")
    err("SELF_VERIFIED", "AI-authored questions can only be VERIFIED by human review or deterministic computation");
  if (/\b(all of the above|none of the above)\b/i.test(q.options?.map((o) => o.text).join(" ") ?? ""))
    warn("AMBIGUOUS_OPTION", "Uses 'all/none of the above', review for ambiguity");
  return issues;
}

export function hasErrors(issues: ValidationIssue[]) {
  return issues.some((i) => i.severity === "error");
}
