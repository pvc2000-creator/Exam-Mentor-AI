import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DB } from "../../playwright.config";

/** Direct database access for the test oracle (which option is correct) and for checking stored state. */
export const db = new PrismaClient({ datasourceUrl: E2E_DB });

export async function shot(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
}

export async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-pass-123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/dashboard/);
}

export type Decide = (q: { topicId: string; correct: string; position: number }) => { pick: "correct" | "wrong" | "skip"; waitMs?: number };

/** Answers an open attempt through the exam UI, using the database only to know the right option. */
export async function answerAttempt(page: Page, decide: Decide, opts: { screenshotAt?: number; name?: string } = {}) {
  await page.waitForURL(/\/attempt\//);
  const attemptId = page.url().split("/attempt/")[1].split(/[?#]/)[0];
  const mtqs = await db.mockTestQuestion.findMany({ where: { mockTest: { attempt: { id: attemptId } } }, orderBy: { position: "asc" } });
  // The page orders questions by position.
  await expect(page.getByText(`Question 1 of ${mtqs.length}`)).toBeVisible();
  const plan: Array<{ topicId: string; pick: string; correct: string }> = [];
  for (let i = 0; i < mtqs.length; i++) {
    const m = mtqs[i];
    await expect(page.getByText(`Question ${i + 1} of ${mtqs.length}`)).toBeVisible();
    const d = decide({ topicId: m.topicIdSnapshot, correct: m.correctOptionSnapshot, position: m.position });
    if (d.waitMs) await page.waitForTimeout(d.waitMs);
    if (d.pick !== "skip") {
      const key = d.pick === "correct" ? m.correctOptionSnapshot : m.correctOptionSnapshot === "A" ? "B" : "A";
      await page.locator("fieldset label").filter({ hasText: new RegExp(`^${key}\\.`) }).click();
      plan.push({ topicId: m.topicIdSnapshot, pick: key, correct: m.correctOptionSnapshot });
    } else plan.push({ topicId: m.topicIdSnapshot, pick: "", correct: m.correctOptionSnapshot });
    if (opts.screenshotAt === i && opts.name) {
      await page.getByRole("button", { name: /mark for review/i }).click();
      await shot(page, opts.name);
    }
    if (i < mtqs.length - 1) await page.getByRole("button", { name: /save & next/i }).click();
  }
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Submit now" }).click();
  await page.waitForURL(/\/results\//, { timeout: 60_000 });
  return { attemptId, plan, correct: plan.filter((p) => p.pick === p.correct).length, unanswered: plan.filter((p) => !p.pick).length };
}

export async function topicStates(userEmail: string) {
  const u = await db.user.findUniqueOrThrow({ where: { email: userEmail } });
  const rows = await db.studentSkillState.findMany({ where: { userId: u.id, level: "TOPIC" }, orderBy: { nodeId: "asc" } });
  return { user: u, rows };
}

export async function latestMock(userId: string) {
  return db.mockTest.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: "desc" }, include: { questions: true } });
}
