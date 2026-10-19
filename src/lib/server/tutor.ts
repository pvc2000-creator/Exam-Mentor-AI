/**
 * Tutor: explains a question the student has already answered.
 *
 * Two providers share one output shape:
 *  - "offline" (always available): built only from stored, reviewed data — the question's explanation,
 *    each option's rationale, the topic's concept note, and a fresh variant generated from the same
 *    deterministic template (answer computed in code), with its worked solution.
 *  - "anthropic" (optional): enabled when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set. The model
 *    is given the verified answer and told to explain it, never to re-decide it. Any reply that names a
 *    different option as correct, refuses, or fails is discarded and the offline tutor answers instead.
 *
 * The API key is read here only; this module is server-only and nothing from it reaches the browser.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { HttpError } from "./http";
import { mulberry32 } from "../rng";
import { TEMPLATES, generateFromTemplate } from "../questions/templates";
import type { QuestionOption } from "../questions/types";

export interface TutorResult {
  provider: "offline" | "anthropic";
  /** Why the offline tutor was used when an AI provider is configured. */
  fallbackReason?: string;
  correctOption: string;
  selectedOption: string | null;
  explanation: string;
  whyYourAnswer: string | null;
  conceptNote: string | null;
  practice: null | { stem: string; options: Array<{ key: string; text: string }>; correctOption: string; solution: string; note: string };
}

type TutorQuestion = {
  id: string;
  stem: string;
  stemHi: string | null;
  options: QuestionOption[];
  correctOption: string;
  explanation: string | null;
  explanationHi: string | null;
  generator: string | null;
  topicName: string;
  conceptNote: string | null;
};

/** Loads a question only if this student has a scored response to it (so answers never leak early). */
export async function loadTutorQuestion(userId: string, questionId: string) {
  const resp = await prisma.response.findFirst({
    where: { userId, questionId, OR: [{ scored: true }, { feedbackShown: true }] },
    select: { id: true },
  });
  if (!resp) throw new HttpError(404, "Question not found");
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true, stem: true, stemHi: true, options: true, correctOption: true, explanation: true, explanationHi: true, generator: true,
      topic: { select: { name: true, conceptNote: true } },
    },
  });
  if (!q) throw new HttpError(404, "Question not found");
  return {
    id: q.id, stem: q.stem, stemHi: q.stemHi, options: q.options as unknown as QuestionOption[], correctOption: q.correctOption,
    explanation: q.explanation, explanationHi: q.explanationHi, generator: q.generator, topicName: q.topic.name, conceptNote: q.topic.conceptNote,
  } satisfies TutorQuestion;
}

/** A fresh, never-stored variant of the same template, so the student can try the method again. */
export function practiceVariant(generator: string | null, seed: number): TutorResult["practice"] {
  const m = generator?.match(/^template:([^@]+)@seed(\d+)$/);
  if (!m) return null;
  const t = TEMPLATES.find((x) => x.id === m[1]);
  if (!t) return null;
  const [v] = generateFromTemplate(t, mulberry32, seed, 1);
  if (!v || v.stem === undefined) return null;
  return {
    stem: v.stem,
    options: v.options.map((o) => ({ key: o.key, text: o.text })),
    correctOption: v.correctOption,
    solution: v.explanation ?? "",
    note: "Generated from the same template with new numbers; the answer is computed in code. Not an official question.",
  };
}

export function offlineTutor(q: TutorQuestion, selected: string | null, lang: "EN" | "HI", seed: number): TutorResult {
  const opt = (k: string | null) => (k ? q.options.find((o) => o.key === k) : undefined);
  const chosen = opt(selected);
  const correct = opt(q.correctOption);
  const explanation =
    (lang === "HI" ? q.explanationHi ?? q.explanation : q.explanation) ??
    `The correct answer is ${q.correctOption}${correct ? ` (${correct.text})` : ""}.`;
  let why: string | null = null;
  if (selected && selected !== q.correctOption) {
    why = chosen?.rationale
      ? `You chose ${selected} (${chosen.text}). ${chosen.rationale}`
      : `You chose ${selected} (${chosen?.text ?? "?"}), which does not match the verified answer ${q.correctOption}.`;
  } else if (!selected) {
    why = "You left this unanswered. Unanswered questions score 0 under the configured marking scheme.";
  }
  return {
    provider: "offline",
    correctOption: q.correctOption,
    selectedOption: selected,
    explanation,
    whyYourAnswer: why,
    conceptNote: q.conceptNote,
    practice: practiceVariant(q.generator, seed),
  };
}

export function aiConfigured() {
  return process.env.AI_PROVIDER === "anthropic" && !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  return client;
}

const SYSTEM = `You are a patient tutor for students preparing for the MP Police Constable written exam.
You explain one multiple-choice question the student has already answered.
Rules:
- The verified correct option is given to you. Never dispute it, never say another option is correct.
- If the student chose a wrong option, explain the likely mistake behind that specific choice.
- Use short paragraphs and plain language. Show arithmetic step by step where relevant.
- Do not invent exam facts (marks, dates, cut-offs) or claim anything about the official exam.
- Reply in the language requested.`;

/** Returns true if the text plainly claims an option other than the verified one is correct. */
export function contradictsAnswer(text: string, correct: string) {
  const re = /(?:correct|right)\s+(?:answer|option)\s+(?:is|=|:)\s*\(?([A-F])\)?\b/gi;
  for (const m of text.matchAll(re)) if (m[1].toUpperCase() !== correct.toUpperCase()) return true;
  return false;
}

async function anthropicTutor(q: TutorQuestion, selected: string | null, lang: "EN" | "HI", base: TutorResult): Promise<TutorResult> {
  const optionLines = q.options.map((o) => `${o.key}. ${o.text}${o.rationale ? ` [stored rationale: ${o.rationale}]` : ""}`).join("\n");
  const prompt = `Question: ${q.stem}
Options:
${optionLines}
Verified correct option: ${q.correctOption}
Stored explanation: ${q.explanation ?? "(none)"}
Topic: ${q.topicName}
Student's answer: ${selected ?? "left unanswered"}
Language for your reply: ${lang === "HI" ? "Hindi" : "English"}

Explain why ${q.correctOption} is correct${selected && selected !== q.correctOption ? ` and what probably led to choosing ${selected}` : ""}. Keep it under 200 words.`;

  const res = await getClient().beta.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") return { ...base, fallbackReason: "The AI provider declined this request." };
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (!text) return { ...base, fallbackReason: "The AI provider returned no text." };
  if (contradictsAnswer(text, q.correctOption)) return { ...base, fallbackReason: "The AI explanation disagreed with the verified answer, so it was discarded." };
  return { ...base, provider: "anthropic", explanation: text };
}

export async function explainQuestion(userId: string, questionId: string, selected: string | null, lang: "EN" | "HI") {
  const q = await loadTutorQuestion(userId, questionId);
  if (selected && !q.options.some((o) => o.key === selected)) selected = null;
  const seed = (Date.now() ^ questionId.length * 2654435761) >>> 0;
  const base = offlineTutor(q, selected, lang, seed);
  if (!aiConfigured()) return base;
  try {
    return await anthropicTutor(q, selected, lang, base);
  } catch (e) {
    console.error("[tutor] AI provider error:", e instanceof Error ? e.name : "unknown");
    return { ...base, fallbackReason: "The AI provider was unavailable." };
  }
}
