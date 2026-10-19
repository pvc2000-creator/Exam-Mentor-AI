import type { MasteryStateT } from "./engine/mastery";

export const STATE_LABEL: Record<MasteryStateT, string> = {
  NOT_STARTED: "Not started",
  INSUFFICIENT_DATA: "Too little data",
  WEAK: "Weak",
  DEVELOPING: "Developing",
  PROFICIENT: "Proficient",
  MASTERED: "Mastered",
  NEEDS_REVIEW: "Needs review",
};

export const STATE_TONE: Record<MasteryStateT, "gray" | "red" | "amber" | "blue" | "green" | "purple"> = {
  NOT_STARTED: "gray",
  INSUFFICIENT_DATA: "gray",
  WEAK: "red",
  DEVELOPING: "amber",
  PROFICIENT: "blue",
  MASTERED: "green",
  NEEDS_REVIEW: "purple",
};

export const STATE_HELP: Record<MasteryStateT, string> = {
  NOT_STARTED: "You have not answered questions on this yet.",
  INSUFFICIENT_DATA: "Fewer than 3 answers, so the mentor will not judge it yet.",
  WEAK: "Estimated chance of answering a new question correctly is below 50%, or your recent accuracy is below 50%.",
  DEVELOPING: "Progressing, but not yet consistent across varied questions.",
  PROFICIENT: "All mastery gates are met. A retention check after the revision interval is needed before it counts as mastered.",
  MASTERED: "Mastery gates met and confirmed after a revision interval. Practised less often, but still revised.",
  NEEDS_REVIEW: "Was mastered, but recent performance dropped or it has not been practised for a long time.",
};

export const MOCK_TYPE_LABEL: Record<string, string> = {
  FULL_LENGTH: "Full-length simulation",
  SUBJECT: "Subject mock",
  TOPIC_PRACTICE: "Topic practice",
  ADAPTIVE_WEAKNESS: "Personalised weakness mock",
  SPEED_DRILL: "Speed and accuracy drill",
  REVISION: "Revision mock",
  MIXED: "Mixed-syllabus mock",
  DIAGNOSTIC: "Diagnostic baseline",
};

export const SLOT_LABEL: Record<string, string> = {
  REMEDIATION: "Weak topic",
  REPEATED_ERRORS: "Repeated errors",
  SPEED_ACCURACY: "Speed / accuracy",
  CONFIRMATION: "Confirm improvement",
  SPACED_REVISION: "Spaced revision",
  MAINTENANCE: "Maintenance",
  COVERAGE: "Syllabus coverage",
  FALLBACK: "Filler (bank shortage)",
};

export function originLabel(origin: string, status: string) {
  if (origin === "OFFICIAL_PREVIOUS_YEAR") return { text: "Previous-year (official)", tone: "green" as const };
  if (origin === "SYNTHETIC_TEMPLATE") return { text: "Synthetic · computed answer", tone: "blue" as const };
  if (origin === "AI_AUTHORED") return { text: status === "VERIFIED" ? "AI-authored · reviewed" : "AI-authored · provisional", tone: status === "VERIFIED" ? ("blue" as const) : ("amber" as const) };
  if (origin === "SOURCE_MATERIAL") return { text: "Source material", tone: "gray" as const };
  return { text: "Human-authored", tone: "gray" as const };
}

export const pct = (x: number | null | undefined, digits = 0) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`);
export const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? "–" : `${Math.round(ms / 1000)} s`);
