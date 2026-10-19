/**
 * Runs acceptance scenarios H–K with synthetic learners on a simulated clock and writes the evidence to
 * docs/simulation_results.md. Synthetic accounts (example.invalid) are removed afterwards unless --keep.
 */
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/server/db";
import { removeSyntheticStudents } from "../src/lib/server/simulate";
import { scenarioHI, scenarioJK, scenarioIsolation } from "../src/lib/server/scenarios";

async function main() {
  const t0 = Date.now();
  const results = [...(await scenarioHI()), ...(await scenarioJK()), await scenarioIsolation()];
  const lines = [
    "# Learner simulation results",
    "",
    `Generated ${new Date().toISOString()} by \`npm run simulate:learners\` in ${((Date.now() - t0) / 1000).toFixed(1)} s.`,
    "",
    "Synthetic students answer through the same server functions as the web app (create mock, start, save each answer with its time, submit), on a simulated clock so revision intervals can elapse. Each student has a fixed probability of answering each topic correctly. These are software checks of the learning engine's behaviour, not evidence about real students' learning.",
    "",
  ];
  for (const r of results) {
    lines.push(`## ${r.id}. ${r.title}: ${r.passed ? "PASS" : "FAIL"}`, "", ...r.evidence.map((e) => `- ${e}`), "");
    console.log(`${r.passed ? "PASS" : "FAIL"} ${r.id} ${r.title}`);
    for (const e of r.evidence) console.log(`    ${e}`);
  }
  await writeFile("docs/simulation_results.md", lines.join("\n"));
  if (!process.argv.includes("--keep")) await removeSyntheticStudents();
  if (results.some((r) => !r.passed)) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
