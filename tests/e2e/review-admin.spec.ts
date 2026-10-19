import { expect, test } from "@playwright/test";
import { db, shot } from "./helpers";

test("admin imports a CSV, reviews and approves a question", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("e2e-admin-password-1");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
  await shot(page, "11-admin-overview");

  await page.goto("/admin/import");
  await page.locator("#file").setInputFiles("data/samples/questions-sample.csv");
  await page.getByRole("button", { name: "Validate and import" }).click();
  await expect(page.getByTestId("import-report")).toContainText("2 added to the review queue");
  await expect(page.getByTestId("import-report")).toContainText("1 invalid");
  await shot(page, "12-admin-import");

  await page.goto("/admin/questions?status=PENDING_REVIEW&q=SAMPLE");
  const q = await db.question.findFirstOrThrow({ where: { stem: { contains: "15% of 260" } } });
  await shot(page, "13-admin-review-queue");
  await page.getByTestId(`approve-${q.id}`).click();
  await expect.poll(async () => (await db.question.findUniqueOrThrow({ where: { id: q.id } })).verificationStatus).toBe("VERIFIED");
  expect(await db.reviewEvent.count({ where: { questionId: q.id } })).toBe(1);

  await page.goto("/admin/quality");
  await shot(page, "14-admin-data-quality");
  await page.goto("/admin/syllabus");
  await shot(page, "15-admin-syllabus");
});
