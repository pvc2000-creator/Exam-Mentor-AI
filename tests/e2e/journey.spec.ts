/**
 * The complete student journey from the brief, through the real UI of the production build:
 * register → baseline → mixed answers with varied times → results → profile changes → personalised
 * mock targets weaknesses → improving mocks shift the allocation → a second student stays independent.
 */
import { expect, test } from "@playwright/test";
import { answerAttempt, db, latestMock, register, shot, topicStates } from "./helpers";

const ARITH = (t: string) => t.startsWith("ar-");
const GK = (t: string) => t.startsWith("gk-");
const stamp = Date.now();
const emailA = `student-a-${stamp}@example.invalid`;
const emailB = `student-b-${stamp}@example.invalid`;

test.describe.configure({ mode: "serial" });

let firstAdaptiveArithShare = 0;
let attemptA = "";

test("student A: baseline, results, profile and a personalised mock that targets weaknesses", async ({ page }) => {
  await page.goto("/");
  await shot(page, "01-landing");
  await register(page, "Synthetic Student A", emailA);
  await shot(page, "02-dashboard-new");

  // 2–4. Baseline: arithmetic answered wrong, every 7th question skipped, varied response times.
  await page.getByRole("button", { name: "Take the diagnostic baseline" }).click();
  const base = await answerAttempt(page, ({ topicId, position }) => ({ pick: position % 7 === 0 ? "skip" : ARITH(topicId) ? "wrong" : "correct", waitMs: position % 5 === 0 ? 1500 : 0 }), { screenshotAt: 4, name: "03-exam-interface" });
  attemptA = base.attemptId;

  // 5. Results match the configured rules (+1 / 0 / 0).
  await expect(page.getByText(`${base.correct} / ${base.plan.length}`)).toBeVisible();
  const stored = await db.attempt.findUniqueOrThrow({ where: { id: base.attemptId } });
  expect(stored).toMatchObject({ score: base.correct, correctCount: base.correct, unansweredCount: base.unanswered });
  const responses = await db.response.findMany({ where: { attemptId: base.attemptId } });
  expect(responses).toHaveLength(base.plan.length);
  expect(new Set(responses.map((r) => r.timeSpentMs)).size).toBeGreaterThan(3);
  expect(responses.filter((r) => r.timeSpentMs >= 1400).length).toBeGreaterThan(0);
  await shot(page, "04-results");

  // 6. The learning profile changed.
  const { user, rows } = await topicStates(emailA);
  expect(rows.length).toBeGreaterThan(10);
  await page.goto("/dashboard");
  await expect(page.getByText("Recommended next")).toBeVisible();
  await shot(page, "05-dashboard-after-baseline");
  await page.goto("/syllabus");
  await shot(page, "06-syllabus");

  // 7–8. The next personalised mock leans on the topics A missed.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next personalised mock" }).click();
  await page.waitForURL(/\/attempt\//);
  const missed = new Set(base.plan.filter((p) => p.pick !== p.correct).map((p) => p.topicId));
  const m1 = await latestMock(user.id);
  const onMissed = m1.questions.filter((q) => missed.has(q.topicIdSnapshot)).length / m1.questions.length;
  firstAdaptiveArithShare = m1.questions.filter((q) => ARITH(q.topicIdSnapshot)).length / m1.questions.length;
  expect(onMissed).toBeGreaterThan(0.5);
  const baseIds = new Set((await db.mockTestQuestion.findMany({ where: { mockTest: { attempt: { id: base.attemptId } } } })).map((q) => q.questionId));
  expect(m1.questions.every((q) => !baseIds.has(q.questionId))).toBe(true); // new questions, not repeats

  // 9. A improves on arithmetic.
  await answerAttempt(page, ({ position }) => ({ pick: position % 6 === 0 ? "wrong" : "correct" }));
  await page.goto("/plan");
  await shot(page, "07-plan");
});

test("student A: improving performance shifts the allocation away from arithmetic", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-pass-123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Next personalised mock" }).click();
    await answerAttempt(page, () => ({ pick: "correct" }));
    await page.goto("/dashboard");
  }
  const { user } = await topicStates(emailA);
  await page.getByRole("button", { name: "Next personalised mock" }).click();
  await page.waitForURL(/\/attempt\//);
  const latest = await latestMock(user.id);
  const arith = latest.questions.filter((q) => ARITH(q.topicIdSnapshot)).length / latest.questions.length;
  // 10. Allocation changes with the profile.
  expect(arith).toBeLessThan(firstAdaptiveArithShare);
  await answerAttempt(page, () => ({ pick: "correct" }));
  await page.goto(`/results/${(await db.attempt.findFirstOrThrow({ where: { userId: user.id }, orderBy: { startedAt: "desc" } })).id}`);
  await shot(page, "08-results-improved");
  await page.goto("/review");
  await shot(page, "09-review");
  const topic = (await db.studentSkillState.findFirstOrThrow({ where: { userId: user.id, level: "TOPIC", nodeId: { startsWith: "ar-" } }, orderBy: { attempts: "desc" } })).nodeId;
  await page.goto(`/syllabus/${topic}`);
  await shot(page, "10-topic-detail");
});

test("student B: independent profile, and no access to student A's data", async ({ page }) => {
  const before = (await topicStates(emailA)).rows.map((r) => ({ id: r.nodeId, s: r.masteryScore, n: r.attempts }));
  await register(page, "Synthetic Student B", emailB);
  await page.getByRole("button", { name: "Take the diagnostic baseline" }).click();
  await answerAttempt(page, ({ topicId }) => ({ pick: GK(topicId) ? "wrong" : "correct" }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next personalised mock" }).click();
  await page.waitForURL(/\/attempt\//);
  const { user: b } = await topicStates(emailB);
  const mB = await latestMock(b.id);
  expect(mB.questions.filter((q) => GK(q.topicIdSnapshot)).length / mB.questions.length).toBeGreaterThan(0.4);

  // 11. A's profile is untouched by B's activity.
  const after = (await topicStates(emailA)).rows.map((r) => ({ id: r.nodeId, s: r.masteryScore, n: r.attempts }));
  expect(after).toEqual(before);

  // B cannot see or change A's records by editing URLs or request bodies.
  const r1 = await page.goto(`/results/${attemptA}`);
  expect(r1?.status()).toBe(404);
  const r2 = await page.goto(`/attempt/${attemptA}`);
  expect(r2?.status()).toBe(404);
  const api = await page.request.post(`/api/attempts/${attemptA}/submit`, { data: {} });
  expect(api.status()).toBe(404);
  const ans = await page.request.post(`/api/attempts/${attemptA}/answer`, { data: { mockTestQuestionId: "x", selectedOption: "A", timeSpentMs: 1 } });
  expect(ans.status()).toBe(404);
  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(404);

  // Signed-out visitors are sent to sign in.
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
