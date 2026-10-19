import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { parseExamConfig, type ExamConfig } from "../exam-config";
import type { SyllabusLookup } from "../questions/validate";

export const EXAM_CODE = "MP_POLICE_CONSTABLE";
export const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "data/exam-config/mp-police-constable-2026.json");

export function loadConfigFile(p = DEFAULT_CONFIG_PATH): ExamConfig {
  return parseExamConfig(JSON.parse(fs.readFileSync(p, "utf8")));
}

/** Returns the active, validated exam configuration and its row id. */
export async function getActiveConfig(examCode = EXAM_CODE) {
  const row = await prisma.syllabusVersion.findFirst({
    where: { exam: { code: examCode }, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new Error("No active syllabus version. Run `npm run db:seed`.");
  return { id: row.id, version: row.version, config: parseExamConfig(row.config) };
}

export function lookupFromConfig(cfg: ExamConfig): SyllabusLookup {
  const topicSubject = new Map<string, string>();
  const subtopicTopic = new Map<string, string>();
  for (const s of cfg.syllabus)
    for (const t of s.topics) {
      topicSubject.set(t.id, s.id);
      for (const st of t.subtopics) subtopicTopic.set(st.id, t.id);
    }
  return {
    hasTopic: (id) => topicSubject.has(id),
    subjectOfTopic: (id) => topicSubject.get(id),
    topicOfSubtopic: (id) => subtopicTopic.get(id),
  };
}

/**
 * Upserts the exam, a syllabus version and its taxonomy. Activating a version deactivates the others.
 * Topics are never deleted, so historical responses keep resolving.
 */
export async function installExamConfig(cfg: ExamConfig, opts: { activate?: boolean; notes?: string } = {}) {
  const exam = await prisma.exam.upsert({
    where: { code: cfg.examCode },
    create: { code: cfg.examCode, name: cfg.examName, nameHi: cfg.examNameHi },
    update: { name: cfg.examName, nameHi: cfg.examNameHi },
  });
  await prisma.$transaction(async (tx) => {
    for (const [si, s] of cfg.syllabus.entries()) {
      await tx.subject.upsert({
        where: { id: s.id },
        create: { id: s.id, examId: exam.id, name: s.name, nameHi: s.nameHi, sortOrder: si },
        update: { name: s.name, nameHi: s.nameHi, sortOrder: si },
      });
      for (const [ti, t] of s.topics.entries()) {
        await tx.topic.upsert({
          where: { id: t.id },
          create: { id: t.id, subjectId: s.id, name: t.name, nameHi: t.nameHi, conceptNote: t.conceptNote, sortOrder: ti },
          update: { subjectId: s.id, name: t.name, nameHi: t.nameHi, conceptNote: t.conceptNote, sortOrder: ti },
        });
        for (const [sti, st] of t.subtopics.entries()) {
          await tx.subtopic.upsert({
            where: { id: st.id },
            create: { id: st.id, topicId: t.id, name: st.name, nameHi: st.nameHi, sortOrder: sti },
            update: { topicId: t.id, name: st.name, nameHi: st.nameHi, sortOrder: sti },
          });
          for (const [oi, obj] of (st.objectives ?? []).entries()) {
            const id = `${st.id}-lo${oi + 1}`;
            await tx.learningObjective.upsert({ where: { id }, create: { id, subtopicId: st.id, description: obj }, update: { description: obj } });
          }
        }
      }
    }
    for (const src of cfg.sources) {
      const data = {
        title: src.title, url: src.url, organization: src.organization,
        publishedAt: src.publishedAt ? new Date(src.publishedAt) : null,
        accessedAt: src.accessedAt ? new Date(src.accessedAt) : null,
        cycle: src.cycle, license: "Reference only (exam information)", allowsRepublish: false,
        notes: [src.verification, src.reference, src.notes].filter(Boolean).join(" | "),
      };
      await tx.source.upsert({ where: { id: src.id }, create: { id: src.id, ...data }, update: data });
    }
    const existing = await tx.syllabusVersion.findUnique({ where: { examId_version: { examId: exam.id, version: cfg.version } } });
    if (opts.activate) await tx.syllabusVersion.updateMany({ where: { examId: exam.id }, data: { isActive: false } });
    const data = { cycle: cfg.cycle, config: cfg as object, verification: cfg.verification, notes: opts.notes ?? cfg.verificationNote, ...(opts.activate ? { isActive: true } : {}) };
    if (existing) await tx.syllabusVersion.update({ where: { id: existing.id }, data });
    else await tx.syllabusVersion.create({ data: { examId: exam.id, version: cfg.version, ...data } });
  });
  return exam;
}
