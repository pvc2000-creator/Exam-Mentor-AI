import { createHash } from "node:crypto";
import type { QuestionInput } from "./types";

/** Normalise text so cosmetic differences (case, spacing, punctuation) do not defeat duplicate detection. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/[“”"'`’‘.,;:!?()[\]{}]/g, "")
    .trim();
}

/**
 * Fingerprint = hash of normalised stem + the set of normalised option texts (order-independent)
 * + the text of the correct option. Re-importing the same question gives the same fingerprint.
 */
export function questionFingerprint(q: Pick<QuestionInput, "stem" | "options" | "correctOption">): string {
  const opts = q.options.map((o) => normaliseText(o.text)).sort();
  const correct = q.options.find((o) => o.key === q.correctOption);
  const payload = [normaliseText(q.stem), opts.join("|"), correct ? normaliseText(correct.text) : ""].join("#");
  return createHash("sha256").update(payload).digest("hex");
}

export function questionIdFromFingerprint(fp: string): string {
  return "q_" + fp.slice(0, 20);
}
