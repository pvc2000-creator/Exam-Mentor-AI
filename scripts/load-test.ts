/**
 * Synthetic load test. Bulk-creates synthetic students with long answer histories, then times the
 * operations a student triggers most: dashboard query, personalised mock generation, full profile
 * recomputation, and a complete 30-question attempt (start, save each answer, submit).
 * Results go to docs/load_test_results.md. Synthetic data is removed afterwards unless --keep.
 *   npm run loadtest                       (default levels)
 *   npm run loadtest -- --students 100 --mocks 10
 */
import os from "node:os";
import { writeFile } from "node:fs/promises";
import { randomUUID as createId } from "node:crypto";
import { prisma } from "../src/lib/server/db";
import { getDashboard } from "../src/lib/server/queries";
import { createMock } from "../src/lib/server/mocks";
import { recomputeProfile } from "../src/lib/server/profile";
import { createSyntheticStudent, profileLearner, removeSyntheticStudents, takeMock, DAY } from "../src/lib/server/simulate";
import { getActiveConfig } from "../src/lib/server/syllabus";
import { mulberry32 } from "../src/lib/rng";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
async function time<T>(fn: () => Promise<T>, out: number[]) { const t = performance.now(); const r = await fn(); out.push(performance.now() - t); return r; }

/** Bulk-insert `mocks` submitted 50-question attempts for one student, bypassing per-answer saves for speed. */
async function seedHistory(userId: string, mocks: number, pool: Array<{ id: string; topicId: string; subtopicId: string | null; skillKey: string; difficulty: "EASY" | "MEDIUM" | "HARD"; correctOption: string; expectedTimeSec: number }>, svId: string, rng: () => number, start: Date) {
  for (let m = 0; m < mocks; m++) {
    const at = new Date(start.getTime() + m * DAY);
    const mockId = createId(), attemptId = createId();
    const picks = Array.from({ length: 50 }, () => pool[Math.floor(rng() * pool.length)]);
    const uniq = [...new Map(picks.map((p) => [p.id, p])).values()];
    const mtq = uniq.map((q, i) => ({ id: createId(), mockTestId: mockId, questionId: q.id, position: i + 1, slotCategory: "COVERAGE", reason: "load test", previouslySeen: false, correctOptionSnapshot: q.correctOption, difficultySnapshot: q.difficulty, topicIdSnapshot: q.topicId, subtopicIdSnapshot: q.subtopicId }));
    await prisma.mockTest.create({ data: { id: mockId, userId, syllabusVersionId: svId, type: "MIXED", title: "Load-test history", seed: m, durationSec: 3600, questionCount: uniq.length, markingScheme: { correct: 1, incorrect: 0, unanswered: 0 }, allocation: [], selectionCriteria: {}, shortages: [], createdAt: at } });
    await prisma.mockTestQuestion.createMany({ data: mtq });
    await prisma.attempt.create({ data: { id: attemptId, mockTestId: mockId, userId, status: "SUBMITTED", startedAt: at, deadlineAt: new Date(at.getTime() + 3600_000), submittedAt: new Date(at.getTime() + 3000_000), score: 0, maxScore: uniq.length } });
    await prisma.response.createMany({
      data: uniq.map((q, i) => {
        const r = rng();
        const sel = r < 0.6 ? q.correctOption : r < 0.85 ? (q.correctOption === "A" ? "B" : "A") : null;
        return { attemptId, mockTestQuestionId: mtq[i].id, questionId: q.id, userId, topicId: q.topicId, subtopicId: q.subtopicId, skillKey: q.skillKey, difficulty: q.difficulty, selectedOption: sel, isCorrect: sel ? sel === q.correctOption : null, timeSpentMs: Math.round(q.expectedTimeSec * 1000 * (0.5 + rng())), answeredAt: new Date(at.getTime() + i * 40_000), scored: true, errorCategory: sel && sel !== q.correctOption ? "UNCLASSIFIED" : null, errorConfidence: sel && sel !== q.correctOption ? 0.3 : null, errorIsTentative: sel && sel !== q.correctOption ? true : null };
      }),
    });
  }
}

async function runLevel(students: number, mocksPer: number, sample: number) {
  const { id: svId } = await getActiveConfig();
  const pool = await prisma.question.findMany({ where: { verificationStatus: { in: ["VERIFIED", "PROVISIONAL"] } }, select: { id: true, topicId: true, subtopicId: true, skillKey: true, difficulty: true, correctOption: true, expectedTimeSec: true } });
  const rng = mulberry32(students * 1000 + mocksPer);
  const start = new Date("2026-04-01T08:00:00Z");
  const t0 = performance.now();
  const ids: string[] = [];
  for (let s = 0; s < students; s++) {
    const u = await createSyntheticStudent(`load${s}`);
    ids.push(u.id);
    await seedHistory(u.id, mocksPer, pool, svId, rng, start);
  }
  const seedMs = performance.now() - t0;
  const recompute: number[] = [], dash: number[] = [], gen: number[] = [], full: number[] = [];
  const now = new Date(start.getTime() + (mocksPer + 1) * DAY);
  for (const id of ids) await time(() => recomputeProfile(id, { now }), recompute);
  for (const id of ids.slice(0, sample)) {
    await time(() => getDashboard(id), dash);
    await time(() => createMock(id, { type: "ADAPTIVE_WEAKNESS" }, { now }), gen);
    await time(() => takeMock(id, { type: "ADAPTIVE_WEAKNESS", questionCount: 30 }, profileLearner([]), { now: new Date(now.getTime() + 3600_000), rng }), full);
  }
  const responses = await prisma.response.count();
  return { students, mocksPer, responsesPerStudent: mocksPer * 50, totalResponsesInDb: responses, seedSec: seedMs / 1000, recompute: stats(recompute), dashboard: stats(dash), generate: stats(gen), attempt: stats(full) };
}

async function main() {
  const custom = process.argv.includes("--students");
  const levels = custom ? [{ s: arg("--students", 50), m: arg("--mocks", 10) }] : [{ s: 20, m: 10 }, { s: 100, m: 20 }];
  const results = [];
  for (const l of levels) {
    console.log(`Level: ${l.s} students × ${l.m} past mocks …`);
    const r = await runLevel(l.s, l.m, Math.min(10, l.s));
    console.log(JSON.stringify(r));
    results.push(r);
  }
  const f = (x: { n: number; p50: number; p95: number; max: number }) => `${x.p50.toFixed(0)} / ${x.p95.toFixed(0)} / ${x.max.toFixed(0)} (n=${x.n})`;
  const lines = [
    "# Load test results",
    "",
    `Generated ${new Date().toISOString()} by \`npm run loadtest\`.`,
    "",
    `Machine: ${os.cpus().length} × ${os.cpus()[0]?.model ?? "CPU"}, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM, ${os.platform()} ${os.release()}, Node ${process.version}. PostgreSQL 16 on the same machine, single Node process, no HTTP layer (server functions are called directly, so network and rendering time are excluded).`,
    "",
    "Levels are cumulative: each level adds its students to the database before measuring, so later levels run against a larger table.",
    "",
    "| Students | Past answers per student (up to) | Answers in DB | Profile recompute p50/p95/max (ms) | Dashboard query | Personalised mock generation | Full 30-question attempt (start, 30 saves, submit) |",
    "|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.students} | ${r.responsesPerStudent} | ${r.totalResponsesInDb.toLocaleString("en-US")} | ${f(r.recompute)} | ${f(r.dashboard)} | ${f(r.generate)} | ${f(r.attempt)} |`),
    "",
    "## Assumptions and limits",
    "",
    "- History rows are bulk-inserted (each past mock: 50 questions, about 60% correct, 15% unanswered) so large histories can be created quickly; the timed operations use the normal application code paths.",
    "- Measurements are sequential (one request at a time). Concurrency was not tested; the in-memory rate limiter and a single Node process are the expected first limits (see docs/deployment.md).",
    "- Profile recomputation reads all of a student's answers for the affected topics, so its cost grows with history length. Submission only recomputes topics in that attempt.",
    "- These numbers describe this machine and dataset only. They are not a claim about production scalability.",
    "",
  ];
  await writeFile("docs/load_test_results.md", lines.join("\n"));
  if (!process.argv.includes("--keep")) {
    const r = await removeSyntheticStudents();
    console.log(`Removed ${r.count} synthetic accounts.`);
  }
}

main().finally(() => prisma.$disconnect());
