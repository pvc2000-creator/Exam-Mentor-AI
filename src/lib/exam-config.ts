import { z } from "zod";

const subtopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameHi: z.string().optional(),
  objectives: z.array(z.string()).optional(),
});

const topicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameHi: z.string().optional(),
  weight: z.number().positive(),
  conceptNote: z.string().optional(),
  subtopics: z.array(subtopicSchema).min(1),
});

const subjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameHi: z.string().optional(),
  topics: z.array(topicSchema).min(1),
});

export const examConfigSchema = z
  .object({
    examCode: z.string().min(1),
    examName: z.string().min(1),
    examNameHi: z.string().optional(),
    version: z.string().min(1),
    cycle: z.string().min(1),
    conductingBody: z.string(),
    verification: z.enum(["OFFICIAL_VERIFIED", "SECONDARY_CONSISTENT", "UNVERIFIED"]),
    verificationNote: z.string().optional(),
    pattern: z.object({
      mode: z.string(),
      totalQuestions: z.number().int().positive(),
      totalMarks: z.number().positive(),
      durationMinutes: z.number().int().positive(),
      optionsPerQuestion: z.number().int().min(2).max(6),
      marking: z.object({ correct: z.number(), incorrect: z.number().max(0), unanswered: z.number() }),
      negativeMarking: z.boolean(),
      level: z.string().optional(),
      languages: z.array(z.enum(["HI", "EN"])).min(1),
      languageNote: z.string().optional(),
    }),
    sections: z
      .array(
        z.object({
          subjectId: z.string(),
          name: z.string(),
          nameHi: z.string().optional(),
          questions: z.number().int().positive(),
          marks: z.number().positive(),
        }),
      )
      .min(1),
    topicWeightsNote: z.string().optional(),
    syllabus: z.array(subjectSchema).min(1),
    sources: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url().nullable(),
        organization: z.string(),
        publishedAt: z.string().nullable(),
        accessedAt: z.string().nullable(),
        cycle: z.string(),
        reference: z.string().optional(),
        verification: z.string(),
        notes: z.string().optional(),
      }),
    ),
    conflicts: z.array(z.string()).default([]),
  })
  .superRefine((cfg, ctx) => {
    // Internal consistency: section totals must equal the pattern totals and
    // the marking scheme must reproduce total marks.
    const q = cfg.sections.reduce((s, x) => s + x.questions, 0);
    const m = cfg.sections.reduce((s, x) => s + x.marks, 0);
    if (q !== cfg.pattern.totalQuestions)
      ctx.addIssue({ code: "custom", message: `Section questions (${q}) != totalQuestions (${cfg.pattern.totalQuestions})` });
    if (m !== cfg.pattern.totalMarks)
      ctx.addIssue({ code: "custom", message: `Section marks (${m}) != totalMarks (${cfg.pattern.totalMarks})` });
    if (cfg.pattern.totalQuestions * cfg.pattern.marking.correct !== cfg.pattern.totalMarks)
      ctx.addIssue({ code: "custom", message: "totalQuestions × marks per correct answer must equal totalMarks" });
    if (cfg.pattern.negativeMarking !== cfg.pattern.marking.incorrect < 0)
      ctx.addIssue({ code: "custom", message: "negativeMarking flag disagrees with marking.incorrect" });
    const subjectIds = new Set(cfg.syllabus.map((s) => s.id));
    for (const s of cfg.sections)
      if (!subjectIds.has(s.subjectId)) ctx.addIssue({ code: "custom", message: `Section references unknown subject ${s.subjectId}` });
    const ids = new Set<string>();
    for (const s of cfg.syllabus)
      for (const t of s.topics)
        for (const id of [t.id, ...t.subtopics.map((x) => x.id)]) {
          if (ids.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate syllabus id ${id}` });
          ids.add(id);
        }
  });

export type ExamConfig = z.infer<typeof examConfigSchema>;
export type MarkingScheme = ExamConfig["pattern"]["marking"];

export function parseExamConfig(raw: unknown): ExamConfig {
  return examConfigSchema.parse(raw);
}

export function topicIndex(cfg: ExamConfig) {
  const topics = new Map<string, { subjectId: string; name: string; nameHi?: string; weight: number; conceptNote?: string; subtopicIds: string[] }>();
  const subtopics = new Map<string, { topicId: string; subjectId: string; name: string; nameHi?: string }>();
  for (const s of cfg.syllabus)
    for (const t of s.topics) {
      topics.set(t.id, { subjectId: s.id, name: t.name, nameHi: t.nameHi, weight: t.weight, conceptNote: t.conceptNote, subtopicIds: t.subtopics.map((x) => x.id) });
      for (const st of t.subtopics) subtopics.set(st.id, { topicId: t.id, subjectId: s.id, name: st.name, nameHi: st.nameHi });
    }
  return { topics, subtopics };
}
