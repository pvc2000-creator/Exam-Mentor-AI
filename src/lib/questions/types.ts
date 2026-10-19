export type OptionKey = "A" | "B" | "C" | "D" | "E" | "F";

export interface QuestionOption {
  key: OptionKey;
  text: string;
  textHi?: string;
  /** Why this option is wrong (or right). Shown after answering. */
  rationale?: string;
  /** Machine-readable misconception tag, used by the error classifier. */
  misconception?: string;
}

export type DifficultyLevel = "EASY" | "MEDIUM" | "HARD";

export type Origin = "OFFICIAL_PREVIOUS_YEAR" | "SOURCE_MATERIAL" | "SYNTHETIC_TEMPLATE" | "AI_AUTHORED" | "HUMAN_AUTHORED";
export type Verification = "VERIFIED" | "PROVISIONAL" | "PENDING_REVIEW" | "REJECTED";
export type VerificationMethodT = "DETERMINISTIC_COMPUTATION" | "HUMAN_REVIEW" | "AUTOMATED_CHECKS" | "OFFICIAL_ANSWER_KEY" | "NONE";

/** Canonical in-memory question record used by importers, templates and validators. */
export interface QuestionInput {
  subjectId: string;
  topicId: string;
  subtopicId?: string | null;
  skillKey: string;
  language: "EN" | "HI";
  stem: string;
  stemHi?: string | null;
  options: QuestionOption[];
  correctOption: string;
  explanation?: string | null;
  explanationHi?: string | null;
  difficulty: DifficultyLevel;
  difficultyBasis: string;
  requiredSkill?: string | null;
  expectedTimeSec: number;
  isNumerical?: boolean;
  origin: Origin;
  isSynthetic: boolean;
  generator?: string | null;
  sourceId?: string | null;
  sourceRef?: string | null;
  paperId?: string | null;
  verificationStatus: Verification;
  verificationMethod: VerificationMethodT;
  license?: string | null;
  reviewNotes?: string | null;
}
