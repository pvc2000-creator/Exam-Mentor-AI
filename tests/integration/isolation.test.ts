import { beforeAll, describe, expect, it } from "vitest";
import { makeUser, signInAs, req, params, json } from "./helpers";
import { prisma } from "@/lib/server/db";
import { createMock, startAttempt, saveAnswer, submitAttempt } from "@/lib/server/mocks";
import { exportAccount } from "@/lib/server/account";
import { POST as answerRoute } from "@/app/api/attempts/[id]/answer/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { POST as feedbackRoute } from "@/app/api/attempts/[id]/feedback/route";
import { POST as tutorRoute } from "@/app/api/tutor/route";
import { GET as exportRoute } from "@/app/api/account/export/route";
import { POST as reviewRoute } from "@/app/api/admin/questions/[id]/review/route";
import { scenarioIsolation } from "@/lib/server/scenarios";

let a: Awaited<ReturnType<typeof makeUser>>, b: Awaited<ReturnType<typeof makeUser>>;
let attemptId: string, mtqId: string, questionId: string;

beforeAll(async () => {
  a = await makeUser();
  b = await makeUser();
  const mock = await createMock(a.user.id, { type: "TOPIC_PRACTICE", topicId: "gk-mp", questionCount: 5, feedbackMode: "IMMEDIATE" });
  const attempt = await startAttempt(a.user.id, mock.id);
  attemptId = attempt.id;
  const mtq = await prisma.mockTestQuestion.findFirstOrThrow({ where: { mockTestId: mock.id } });
  mtqId = mtq.id;
  questionId = mtq.questionId;
  await saveAnswer(a.user.id, attemptId, { mockTestQuestionId: mtqId, selectedOption: "A", timeSpentMs: 4000 });
});

describe("student data isolation (student B attacking student A's records)", () => {
  it("cannot save answers into another student's attempt", async () => {
    signInAs(b.token);
    const r = await json(await answerRoute(req("POST", { mockTestQuestionId: mtqId, selectedOption: "B", timeSpentMs: 1 }), params(attemptId)));
    expect(r.status).toBe(404);
    expect((await prisma.response.findFirstOrThrow({ where: { attemptId, mockTestQuestionId: mtqId } })).selectedOption).toBe("A");
  });

  it("cannot reveal answers or submit another student's attempt", async () => {
    signInAs(b.token);
    expect((await feedbackRoute(req("POST", { mockTestQuestionId: mtqId }), params(attemptId))).status).toBe(404);
    expect((await submitRoute(req("POST", {}), params(attemptId))).status).toBe(404);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).status).toBe("IN_PROGRESS");
  });

  it("cannot get a tutor explanation (and so the answer) for a question they have not answered", async () => {
    signInAs(b.token);
    expect((await tutorRoute(req("POST", { questionId, selectedOption: "A" }))).status).toBe(404);
    // Not even the owner gets it before the answer is scored or feedback is shown.
    const other = await prisma.mockTestQuestion.findFirstOrThrow({ where: { mockTest: { attempt: { id: attemptId } }, NOT: { id: mtqId } } });
    signInAs(a.token);
    expect((await tutorRoute(req("POST", { questionId: other.questionId }))).status).toBe(404);
  });

  it("owner can use their own attempt", async () => {
    signInAs(a.token);
    expect((await feedbackRoute(req("POST", { mockTestQuestionId: mtqId }), params(attemptId))).status).toBe(200);
    const t = await json(await tutorRoute(req("POST", { questionId, selectedOption: "A" })));
    expect(t.status).toBe(200);
    expect(t.body?.provider).toBe("offline");
  });

  it("the data export contains only the requesting student's records", async () => {
    signInAs(b.token);
    const res = await exportRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(b.user.id);
    expect(body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(attemptId);
    const own = await exportAccount(a.user.id);
    expect(own.attempts.map((x) => x.id)).toContain(attemptId);
  });

  it("students cannot approve questions", async () => {
    signInAs(b.token);
    expect((await reviewRoute(req("POST", { action: "approve" }), params(questionId))).status).toBe(403);
  });

  it("rejects malformed identifiers", async () => {
    signInAs(a.token);
    expect((await answerRoute(req("POST", { mockTestQuestionId: "x".repeat(500), selectedOption: "A", timeSpentMs: 1 }), params(attemptId))).status).toBe(400);
    expect((await submitRoute(req("POST", {}), params("not-an-attempt"))).status).toBe(404);
  });

  it("one student's practice never changes another student's learning profile", async () => {
    const r = await scenarioIsolation();
    expect(r.passed, r.evidence.join("\n")).toBe(true);
  });

  it("deleting an account removes that student's data and nothing else", async () => {
    const victim = await makeUser();
    const m = await createMock(victim.user.id, { type: "DIAGNOSTIC" });
    const at = await startAttempt(victim.user.id, m.id);
    await submitAttempt(victim.user.id, at.id);
    const othersBefore = await prisma.response.count({ where: { userId: { not: victim.user.id } } });
    await prisma.user.delete({ where: { id: victim.user.id } });
    expect(await prisma.response.count({ where: { userId: victim.user.id } })).toBe(0);
    expect(await prisma.attempt.count({ where: { userId: victim.user.id } })).toBe(0);
    expect(await prisma.response.count({ where: { userId: { not: victim.user.id } } })).toBe(othersBefore);
  });
});
