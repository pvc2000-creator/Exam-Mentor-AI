/**
 * Previous-year paper analysis. Writes research/paper_analysis.md from verified papers in the database.
 * With no verified papers it says so rather than inventing a distribution.
 */
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/server/db";
import { paperAnalysis } from "../src/lib/server/admin";

const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);

async function main() {
  const a = await paperAnalysis();
  const lines = [
    "# Previous-year paper analysis",
    "",
    `Generated ${new Date().toISOString()} by \`npm run analyze:papers\`.`,
    "",
    `**Reliability:** ${a.reliability}`,
    "",
    `Papers recorded: ${a.papers.length} (verified: ${a.verifiedCount}). Questions from verified papers: ${a.totalQuestions}.`,
    "",
    "## Papers",
    "",
    ...(a.papers.length ? a.papers.map((p) => `- ${p.title} (${p.year}) · ${p.questionCount} questions · ${p.isVerified ? "verified" : "unverified"}`) : ["- None recorded. Official question papers were not obtainable from the MPESB site during research (see research/official_sources.md)."]),
    "",
    "## Difficulty distribution (verified papers)",
    "",
    a.totalQuestions ? `EASY ${a.difficulty.EASY} · MEDIUM ${a.difficulty.MEDIUM} · HARD ${a.difficulty.HARD}` : "No data.",
    "",
    "## Topic share: configuration vs observed",
    "",
    "| Subject | Topic | Configured share | Observed count | Observed share |",
    "|---|---|---|---|---|",
    ...a.topics.map((t) => `| ${t.subject} | ${t.name} | ${pct(t.configShare)} | ${t.observed} | ${pct(t.observedShare)} |`),
    "",
    "Configured shares come from topic weights in the exam configuration, which are estimates (see research/syllabus.md). They are not predictions of the next paper.",
    "",
  ];
  await writeFile("research/paper_analysis.md", lines.join("\n"));
  console.log(`Wrote research/paper_analysis.md (${a.verifiedCount} verified papers).`);
}

main().finally(() => prisma.$disconnect());
