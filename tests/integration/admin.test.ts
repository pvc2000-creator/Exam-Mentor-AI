import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeUser, signInAs, req, params, json } from "./helpers";
import { prisma } from "@/lib/server/db";
import { POST as importRoute } from "@/app/api/admin/import/route";
import { POST as reviewRoute } from "@/app/api/admin/questions/[id]/review/route";
import { POST as syllabusRoute } from "@/app/api/admin/syllabus/route";
import { createMock } from "@/lib/server/mocks";
import { dataQuality, paperAnalysis } from "@/lib/server/admin";

function upload(name: string, content: string, type: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new File([content], name, { type }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return new Request("http://localhost/api/admin/import", { method: "POST", body: fd });
}

describe("admin import and review", () => {
  it("imports CSV into the review queue, reports invalid rows and de-duplicates re-imports", async () => {
    const { token } = await makeUser("ADMIN");
    signInAs(token);
    const csv = readFileSync("data/samples/questions-sample.csv", "utf8");
    const first = await json(await importRoute(upload("sample.csv", csv, "text/csv")));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ format: "csv", total: 3, created: 2, invalid: 1 });
    const again = await json(await importRoute(upload("sample.csv", csv, "text/csv")));
    expect(again.body).toMatchObject({ created: 0, duplicates: 2 });
    const imported = await prisma.question.findMany({ where: { stem: { startsWith: "SAMPLE (synthetic)" } } });
    expect(imported.every((q) => q.verificationStatus === "PENDING_REVIEW")).toBe(true);
    expect(await prisma.importBatch.count({ where: { fileName: "sample.csv" } })).toBeGreaterThanOrEqual(2);
  });

  it("rejects disguised, oversized and empty uploads", async () => {
    const { token } = await makeUser("ADMIN");
    signInAs(token);
    expect((await importRoute(upload("evil.pdf", "MZ\0\0not a pdf", "application/pdf", { topicId: "gk-mp" }))).status).toBe(415);
    expect((await importRoute(upload("big.csv", "a".repeat(6 * 1024 * 1024), "text/csv"))).status).toBe(413);
    expect((await importRoute(upload("empty.csv", "", "text/csv"))).status).toBe(400);
  });

  it("approve, edit and reject write review events and audit logs; only approved questions reach students", async () => {
    const { user, token } = await makeUser("ADMIN");
    signInAs(token);
    await importRoute(upload("dir.json", readFileSync("data/samples/questions-sample.json", "utf8"), "application/json"));
    const q = await prisma.question.findFirstOrThrow({ where: { stem: { contains: "walks 3 km North" } } });
    expect(q.verificationStatus).toBe("PENDING_REVIEW");

    const edit = await json(await reviewRoute(req("POST", { action: "edit", stem: q.stem + " (edited)", options: ["5 km", "7 km", "1 km", "12 km"], correctOption: "A", explanation: "Distance = √(3² + 4²) = 5 km.", difficulty: "MEDIUM", topicId: "rsn-direction" }), params(q.id)));
    expect(edit.body).toMatchObject({ to: "PENDING_REVIEW" });
    const bad = await json(await reviewRoute(req("POST", { action: "edit", stem: q.stem, options: ["5 km", "5 km"], correctOption: "A", difficulty: "MEDIUM", topicId: "rsn-direction" }), params(q.id)));
    expect(bad.status).toBe(400);

    const ok = await json(await reviewRoute(req("POST", { action: "approve", note: "Checked" }), params(q.id)));
    expect(ok.body).toMatchObject({ from: "PENDING_REVIEW", to: "VERIFIED" });
    const after = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
    expect(after).toMatchObject({ verificationStatus: "VERIFIED", verificationMethod: "HUMAN_REVIEW" });
    expect(await prisma.reviewEvent.count({ where: { questionId: q.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { userId: user.id, target: q.id } })).toBe(2);

    expect((await json(await reviewRoute(req("POST", { action: "reject" }), params(q.id)))).status).toBe(400); // reason required
    await reviewRoute(req("POST", { action: "reject", note: "Duplicate of an existing item" }), params(q.id));
    expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).verificationStatus).toBe("REJECTED");

    const student = await makeUser();
    const mock = await createMock(student.user.id, { type: "TOPIC_PRACTICE", topicId: "rsn-direction", questionCount: 30 });
    expect(await prisma.mockTestQuestion.count({ where: { mockTestId: mock.id, questionId: q.id } })).toBe(0);
  });

  it("validates uploaded syllabus versions and refuses inconsistent ones", async () => {
    const { token } = await makeUser("ADMIN");
    signInAs(token);
    const raw = JSON.parse(readFileSync("data/exam-config/mp-police-constable-2026.json", "utf8"));
    raw.version = `test-${Date.now()}`;
    raw.sections[0].questions = 41;
    const fd = new FormData();
    fd.set("file", new File([JSON.stringify(raw)], "cfg.json", { type: "application/json" }));
    const res = await json(await syllabusRoute(new Request("http://localhost/api/admin/syllabus", { method: "POST", body: fd })));
    expect(res.status).toBe(400);
    raw.sections[0].questions = 40;
    const fd2 = new FormData();
    fd2.set("file", new File([JSON.stringify(raw)], "cfg.json", { type: "application/json" }));
    const ok = await json(await syllabusRoute(new Request("http://localhost/api/admin/syllabus", { method: "POST", body: fd2 })));
    expect(ok.body).toMatchObject({ version: raw.version, activated: false });
    const active = await prisma.syllabusVersion.findMany({ where: { isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].version).not.toBe(raw.version);
  });

  it("reports data quality and paper analysis honestly", async () => {
    const q = await dataQuality();
    expect(q.totals.VERIFIED).toBeGreaterThan(0);
    expect(q.byOrigin.some((r) => r.origin === "OFFICIAL_PREVIOUS_YEAR")).toBe(false);
    const p = await paperAnalysis();
    expect(p.verifiedCount).toBe(0);
    expect(p.reliability).toMatch(/No verified previous-year papers/);
  });
});
