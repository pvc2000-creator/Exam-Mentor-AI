/**
 * Seeds the exam configuration, syllabus taxonomy and the synthetic development question bank.
 * Safe to run repeatedly: everything is upserted or de-duplicated by fingerprint.
 * Creates no user accounts (see scripts/create-admin.ts).
 */
import { prisma } from "../src/lib/server/db";
import { installExamConfig, loadConfigFile, lookupFromConfig } from "../src/lib/server/syllabus";
import { importQuestions } from "../src/lib/server/importer";
import { authoredQuestions, templateQuestions, SYNTHETIC_SOURCE_ID, AUTHORED_SOURCE_ID } from "../src/lib/questions/bank";

async function main() {
  const cfg = loadConfigFile();
  await installExamConfig(cfg, { activate: true });
  const lookup = lookupFromConfig(cfg);
  for (const s of [
    { id: SYNTHETIC_SOURCE_ID, title: "ExamMentor synthetic template bank", organization: "ExamMentor AI", license: "Project-owned synthetic content", allowsRepublish: true, notes: "Parameterised templates; answers computed in code (src/lib/questions/templates.ts). Not official questions." },
    { id: AUTHORED_SOURCE_ID, title: "ExamMentor AI-authored factual set", organization: "ExamMentor AI", license: "Project-owned synthetic content", allowsRepublish: true, notes: "AI-authored during development; provisional until human-reviewed. Not official questions." },
  ]) await prisma.source.upsert({ where: { id: s.id }, create: s, update: s });

  const variants = Number(process.env.SEED_VARIANTS ?? 14);
  const t = await importQuestions({ questions: templateQuestions(variants), unresolved: [] }, lookup, { fileName: "templates", format: "template" });
  const a = await importQuestions({ questions: authoredQuestions((id) => lookup.subjectOfTopic(id)), unresolved: [] }, lookup, { fileName: "authored-gk-science.json", format: "json" });
  console.log(`Exam config ${cfg.version} installed and active.`);
  console.log(`Templates: ${t.created} created, ${t.duplicates} duplicates, ${t.invalid} invalid, ${t.flagged} flagged.`);
  console.log(`Authored:  ${a.created} created, ${a.duplicates} duplicates, ${a.invalid} invalid, ${a.flagged} flagged.`);
  for (const r of [...t.items, ...a.items].filter((i) => i.status === "invalid")) console.log("  invalid:", r.stem, r.issues.map((i) => i.code).join(","));
  console.log(`Question bank now holds ${await prisma.question.count()} questions.`);
}

main().finally(() => prisma.$disconnect());
