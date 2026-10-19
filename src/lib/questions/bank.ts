/**
 * Builds the development question bank from (a) computed-answer templates and (b) the authored
 * GK/science file. Everything produced here is synthetic and labelled as such.
 */
import authored from "../../../data/questions/authored-gk-science.json";
import { mulberry32, hashString } from "../rng";
import { TEMPLATES, generateFromTemplate } from "./templates";
import type { OptionKey, QuestionInput, Verification } from "./types";

const KEYS: OptionKey[] = ["A", "B", "C", "D", "E", "F"];

export const SYNTHETIC_SOURCE_ID = "exammentor-synthetic";
export const AUTHORED_SOURCE_ID = "exammentor-authored";

export function templateQuestions(variantsPerTemplate = 14): QuestionInput[] {
  const out: QuestionInput[] = [];
  for (const t of TEMPLATES) {
    for (const v of generateFromTemplate(t, mulberry32, hashString(t.id), variantsPerTemplate)) {
      out.push({
        subjectId: t.subjectId,
        topicId: t.topicId,
        subtopicId: t.subtopicId,
        skillKey: t.skillKey,
        language: "EN",
        stem: v.stem,
        stemHi: v.stemHi,
        options: v.options,
        correctOption: v.correctOption,
        explanation: v.explanation,
        explanationHi: v.explanationHi,
        difficulty: t.difficulty,
        difficultyBasis: t.difficultyBasis,
        requiredSkill: t.requiredSkill,
        expectedTimeSec: t.expectedTimeSec,
        isNumerical: t.isNumerical,
        origin: "SYNTHETIC_TEMPLATE",
        isSynthetic: true,
        generator: `template:${t.id}@seed${v.seed}`,
        sourceId: SYNTHETIC_SOURCE_ID,
        verificationStatus: "VERIFIED",
        verificationMethod: "DETERMINISTIC_COMPUTATION",
        license: "Project-owned synthetic content",
      });
    }
  }
  return out;
}

interface AuthoredItem {
  t: string; st: string; k: string; d: "EASY" | "MEDIUM" | "HARD";
  q: string; qh?: string; o: string[]; oh?: string[]; a: number; e: string; eh?: string;
  s?: Verification; n?: string;
}

const EXPECTED_TIME = { EASY: 25, MEDIUM: 35, HARD: 45 } as const;

export function authoredQuestions(subjectOfTopic: (topicId: string) => string | undefined): QuestionInput[] {
  return (authored.items as AuthoredItem[]).map((it) => ({
    subjectId: subjectOfTopic(it.t) ?? "unknown",
    topicId: it.t,
    subtopicId: it.st,
    skillKey: it.k,
    language: "EN",
    stem: it.q,
    stemHi: it.qh ?? null,
    options: it.o.map((text, i) => ({
      key: KEYS[i],
      text,
      ...(it.oh?.[i] && it.oh[i] !== text ? { textHi: it.oh[i] } : {}),
      ...(i === it.a ? { rationale: "Correct." } : {}),
    })),
    correctOption: KEYS[it.a],
    explanation: it.e,
    explanationHi: it.eh ?? null,
    difficulty: it.d,
    difficultyBasis: "Rubric: EASY = direct recall of a core fact; MEDIUM = recall with a common confusable; HARD = less common fact or a frequent trap",
    requiredSkill: it.k,
    expectedTimeSec: EXPECTED_TIME[it.d],
    isNumerical: false,
    origin: "AI_AUTHORED",
    isSynthetic: true,
    generator: authored.meta.author,
    sourceId: AUTHORED_SOURCE_ID,
    verificationStatus: it.s ?? "PROVISIONAL",
    verificationMethod: "AUTOMATED_CHECKS",
    license: authored.meta.license,
    reviewNotes: it.n ?? "AI-authored; passed structural checks; awaiting independent human review.",
  }));
}
