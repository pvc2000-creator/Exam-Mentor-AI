/**
 * Command-line importer for CSV, JSON or PDF question files. Same validation path as the admin page:
 * size and type checks, validation, fingerprint de-duplication, and every record enters PENDING_REVIEW.
 *   npm run import:questions -- path/to/file.csv
 *   npm run import:questions -- paper.pdf --topic gk-history
 *   npm run import:questions -- file.json --dry-run
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/server/db";
import { getActiveConfig, lookupFromConfig } from "../src/lib/server/syllabus";
import { parseUpload } from "../src/lib/server/upload";
import { importQuestions } from "../src/lib/server/importer";
import { validateQuestion } from "../src/lib/questions/validate";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: npm run import:questions -- <file.csv|file.json|file.pdf> [--topic <topicId>] [--dry-run]");
  const ti = args.indexOf("--topic");
  const topic = ti >= 0 ? args[ti + 1] : undefined;
  const { config } = await getActiveConfig();
  const lookup = lookupFromConfig(config);
  const { format, parsed } = await parseUpload(path.basename(file), await readFile(file), (t) => lookup.subjectOfTopic(t), { fallbackTopicId: topic });
  if (args.includes("--dry-run")) {
    let errors = 0;
    parsed.questions.forEach((q, i) => {
      const issues = validateQuestion(q, lookup);
      if (issues.length) console.log(`#${i + 1}: ${issues.map((x) => `${x.severity}:${x.code}`).join(", ")}`);
      errors += issues.some((x) => x.severity === "error") ? 1 : 0;
    });
    console.log(`${format.toUpperCase()}: ${parsed.questions.length} parsed, ${errors} with errors, ${parsed.unresolved.length} unresolved. Nothing written (dry run).`);
    return;
  }
  const r = await importQuestions(parsed, lookup, { fileName: path.basename(file), format });
  console.log(`${format.toUpperCase()}: ${r.total} records, ${r.created} added (pending review), ${r.duplicates} duplicates, ${r.invalid} invalid, ${r.flagged} flagged, ${r.unresolved.length} unresolved. Batch ${r.batchId}.`);
  for (const i of r.items.filter((x) => x.status === "invalid")) console.log(`  invalid #${i.index + 1}: ${i.issues.map((x) => x.message).join("; ")}`);
  for (const u of r.unresolved) console.log(`  unresolved ${u.ref}: ${u.reason}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
