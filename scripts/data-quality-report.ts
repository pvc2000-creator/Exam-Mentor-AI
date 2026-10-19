/** Writes research/data_quality_report.md from the live database. */
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/server/db";
import { dataQuality } from "../src/lib/server/admin";

async function main() {
  const q = await dataQuality();
  const total = Object.values(q.totals).reduce((a, b) => a + b, 0);
  const thin = q.topics.filter((t) => t.fullMocksBeforeRepeat < 3);
  const lines = [
    "# Data quality report",
    "",
    `Generated ${new Date().toISOString()} by \`npm run report:quality\` against the active configuration ${q.version} (${q.verification}).`,
    "",
    "## Summary",
    "",
    `- Questions in the bank: ${total} (verified ${q.totals.VERIFIED ?? 0}, provisional ${q.totals.PROVISIONAL ?? 0}, pending review ${q.totals.PENDING_REVIEW ?? 0}, rejected ${q.totals.REJECTED ?? 0}).`,
    `- Official previous-year questions: ${q.byOrigin.filter((r) => r.origin === "OFFICIAL_PREVIOUS_YEAR").reduce((a, r) => a + r.count, 0)}. The bank is synthetic practice material.`,
    `- Missing Hindi text: ${q.noHindi}. Missing explanation: ${q.noExplanation}.`,
    `- Quality flags: ${Object.entries(q.flagCounts).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
    `- Difficulty calibration: ${q.calibration.questionsWithEnoughData} questions have ≥ 20 answers; ${q.calibration.miscalibrated} disagree with their label.`,
    `- Topics with fewer than three full-length mocks' worth of eligible questions: ${thin.length ? thin.map((t) => t.name).join(", ") : "none"}.`,
    "",
    "## By origin and status",
    "",
    "| Origin | Status | Count |",
    "|---|---|---|",
    ...q.byOrigin.map((r) => `| ${r.origin} | ${r.status} | ${r.count} |`),
    "",
    "## Coverage by topic",
    "",
    "| Topic | Eligible | Verified | Pending | Easy/Med/Hard | Per full mock | Full mocks before repeats |",
    "|---|---|---|---|---|---|---|",
    ...q.topics.map((t) => `| ${t.name} | ${t.eligible} | ${t.verified} | ${t.pending} | ${t.easy}/${t.medium}/${t.hard} | ${t.perFullMock} | ${t.fullMocksBeforeRepeat} |`),
    "",
    "## Sources",
    "",
    ...q.sources.map((s) => `- **${s.title}** (${s.id}) · ${s.license ?? "licence not recorded"} · ${s.allowsRepublish ? "may republish" : "reference only"}${s.url ? ` · ${s.url}` : ""}`),
    "",
    "## Known conflicts in exam information",
    "",
    ...(q.conflicts.length ? q.conflicts.map((c) => `- ${c}`) : ["- None recorded."]),
    "",
    "## Recent imports",
    "",
    ...(q.batches.length ? q.batches.map((b) => `- ${b.createdAt.toISOString().slice(0, 10)} ${b.fileName} (${b.format}): ${b.total} records, ${b.created} created, ${b.duplicates} duplicates, ${b.invalid} invalid, ${b.flagged} flagged`) : ["- None."]),
    "",
    "## What this means",
    "",
    "- Synthetic template questions have answers computed in code and are VERIFIED by computation. Their wording and difficulty labels are rubric-based, not calibrated on real candidates until enough students answer them.",
    "- AI-authored factual questions are PROVISIONAL: automated checks passed, but no human has reviewed them. Set ALLOW_PROVISIONAL_QUESTIONS=false to serve only verified questions.",
    "- No official previous-year questions are included, because no officially published paper with a licence permitting reuse was obtained.",
    "",
  ];
  await writeFile("research/data_quality_report.md", lines.join("\n"));
  console.log("Wrote research/data_quality_report.md");
}

main().finally(() => prisma.$disconnect());
