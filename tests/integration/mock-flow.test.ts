import { describe, expect, it } from "vitest";
import { makeUser, signInAs, req, params, json } from "./helpers";
import { prisma } from "@/lib/server/db";
import { createMock, startAttempt, saveAnswer, submitAttempt, expireOverdue, revealFeedback, GRACE_MS } from "@/lib/server/mocks";
import { POST as createMockRoute } from "@/app/api/mocks/route";
import { POST as answerRoute } from "@/app/api/attempts/[id]/answer/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";

async function fresh(type: "DIAGNOSTIC" | "FULL_LENGTH" | "TOPIC_PRACTICE" = "DIAGNOSTIC", extra: Record<string, unknown> = {}, now = new Date()) {
  const { user, token } = await makeUser();
  const mock = await createMock(user.id, { type, ...extra } as never, { now });
  const attempt = await startAttempt(user.id, mock.id, now);
  const mtqs = await prisma.mockTestQuestion.findMany({ where: { mockTestId: mock.id }, orderBy: { position: "asc" } });
  return { user, token, mock, attempt, mtqs };
}

describe("mock creation", () => {
  it("builds a full-length mock that follows the exam configuration", async () => {
    const { mock, mtqs } = await fresh("FULL_LENGTH");
    expect(mock.questionCount).toBe(100);
    expect(mock.durationSec).toBe(120 * 60);
    expect(mock.markingScheme).toEqual({ correct: 1, incorrect: 0, unanswered: 0 });
    expect(new Set(mtqs.map((m) => m.questionId)).size).toBe(100);
    const subjects = await prisma.question.groupBy({ by: ["subjectId"], where: { id: { in: mtqs.map((m) => m.questionId) } }, _count: true });
    expect(Object.fromEntries(subjects.map((s) => [s.subjectId, s._count]))).toEqual({ "gk-reasoning": 40, "mental-ability": 30, "science-arithmetic": 30 });
    expect(mock.seed).toBeTypeOf("number");
    expect(mock.selectionCriteria).toMatchObject({ eligibleStatuses: ["VERIFIED", "PROVISIONAL"] });
  });

  it("never serves questions that are pending review or rejected", async () => {
    const { mtqs } = await fresh("DIAGNOSTIC");
    const statuses = await prisma.question.findMany({ where: { id: { in: mtqs.map((m) => m.questionId) } }, select: { verificationStatus: true } });
    expect(statuses.every((s) => s.verificationStatus === "VERIFIED" || s.verificationStatus === "PROVISIONAL")).toBe(true);
  });

  it("refuses a second open attempt through the API", async () => {
    const { token } = await makeUser();
    signInAs(token);
    const first = await json(await createMockRoute(req("POST", { type: "TOPIC_PRACTICE", topicId: "ar-percentage", questionCount: 5 })));
    expect(first.status).toBe(200);
    const second = await json(await createMockRoute(req("POST", { type: "DIAGNOSTIC" })));
    expect(second.status).toBe(409);
  });
});

describe("answers and submission", () => {
  it("persists every answer and response time, and scores by the configured rules", async () => {
    const t0 = new Date();
    const { user, attempt, mtqs } = await fresh("DIAGNOSTIC", {}, t0);
    const plan = mtqs.map((m, i) => ({ m, sel: i % 3 === 0 ? m.correctOptionSnapshot : i % 3 === 1 ? (m.correctOptionSnapshot === "A" ? "B" : "A") : null, ms: 5_000 + i * 1000 }));
    let clock = t0.getTime();
    for (const p of plan) {
      clock += p.ms;
      await saveAnswer(user.id, attempt.id, { mockTestQuestionId: p.m.id, selectedOption: p.sel, timeSpentMs: p.ms }, new Date(clock));
    }
    await submitAttempt(user.id, attempt.id, { now: new Date(clock + 1000) });
    const rows = await prisma.response.findMany({ where: { attemptId: attempt.id } });
    expect(rows).toHaveLength(mtqs.length);
    for (const p of plan) {
      const r = rows.find((x) => x.mockTestQuestionId === p.m.id)!;
      expect(r.selectedOption).toBe(p.sel);
      expect(r.timeSpentMs).toBe(p.ms);
      expect(r.isCorrect).toBe(p.sel === null ? null : p.sel === p.m.correctOptionSnapshot);
    }
    const a = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const correct = plan.filter((p) => p.sel === p.m.correctOptionSnapshot).length;
    expect(a).toMatchObject({ status: "SUBMITTED", score: correct, maxScore: mtqs.length, correctCount: correct, unansweredCount: plan.filter((p) => p.sel === null).length });
    // Wrong answers carry a diagnosis with confidence; uncertain ones are marked tentative.
    const wrong = rows.filter((r) => r.isCorrect === false);
    expect(wrong.every((r) => r.errorCategory && r.errorConfidence !== null && r.errorIsTentative !== null)).toBe(true);
  });

  it("clamps impossible response times to the elapsed time", async () => {
    const t0 = new Date();
    const { user, attempt, mtqs } = await fresh("DIAGNOSTIC", {}, t0);
    await saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: "A", timeSpentMs: 3_600_000 }, new Date(t0.getTime() + 10_000));
    expect((await prisma.response.findFirstOrThrow({ where: { attemptId: attempt.id, mockTestQuestionId: mtqs[0].id } })).timeSpentMs).toBe(10_000);
  });

  it("rejects invalid options and question ids", async () => {
    const { user, attempt, mtqs } = await fresh();
    await expect(saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: "F", timeSpentMs: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(saveAnswer(user.id, attempt.id, { mockTestQuestionId: "does-not-exist", selectedOption: "A", timeSpentMs: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: "A", timeSpentMs: -1 })).rejects.toThrow();
  });

  it("handles duplicate and concurrent submissions idempotently", async () => {
    const { user, token, attempt, mtqs } = await fresh();
    await saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: mtqs[0].correctOptionSnapshot, timeSpentMs: 9000 });
    signInAs(token);
    const results = await Promise.all([submitRoute(req("POST", {}), params(attempt.id)), submitRoute(req("POST", {}), params(attempt.id)), submitAttempt(user.id, attempt.id)]);
    expect(results.filter((r) => r instanceof Response).every((r) => (r as Response).status === 200)).toBe(true);
    const snaps = await prisma.masterySnapshot.count({ where: { attemptId: attempt.id } });
    const again = await submitAttempt(user.id, attempt.id);
    expect(again).toMatchObject({ alreadySubmitted: true });
    expect(await prisma.masterySnapshot.count({ where: { attemptId: attempt.id } })).toBe(snaps);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).correctCount).toBe(1);
  });

  it("refuses answers after submission", async () => {
    const { user, token, attempt, mtqs } = await fresh();
    await submitAttempt(user.id, attempt.id);
    signInAs(token);
    const r = await json(await answerRoute(req("POST", { mockTestQuestionId: mtqs[0].id, selectedOption: "A", timeSpentMs: 1 }), params(attempt.id)));
    expect(r.status).toBe(409);
  });

  it("auto-submits when time runs out, keeping saved answers (interrupted test)", async () => {
    const t0 = new Date(Date.now() - 3 * 3600_000);
    const { user, attempt, mtqs, mock } = await fresh("DIAGNOSTIC", {}, t0);
    await saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: mtqs[0].correctOptionSnapshot, timeSpentMs: 20_000 }, new Date(t0.getTime() + 20_000));
    // The student closes the browser. A late save is refused and triggers automatic submission.
    const late = new Date(t0.getTime() + mock.durationSec * 1000 + GRACE_MS + 1000);
    await expect(saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[1].id, selectedOption: "A", timeSpentMs: 5 }, late)).rejects.toMatchObject({ status: 409 });
    const a = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(a.status).toBe("AUTO_SUBMITTED");
    expect(a.submittedAt!.getTime()).toBe(attempt.deadlineAt.getTime());
    expect(a.correctCount).toBe(1);
    const r1 = await prisma.response.findFirstOrThrow({ where: { attemptId: attempt.id, mockTestQuestionId: mtqs[1].id } });
    expect(r1.selectedOption).toBeNull();
  });

  it("expires overdue attempts in the background sweep", async () => {
    const t0 = new Date(Date.now() - 5 * 3600_000);
    const { user, attempt } = await fresh("DIAGNOSTIC", {}, t0);
    expect(await expireOverdue(user.id)).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe("AUTO_SUBMITTED");
  });

  it("locks an answer once immediate feedback has been shown", async () => {
    const { user, attempt, mtqs } = await fresh("TOPIC_PRACTICE", { topicId: "ar-percentage", questionCount: 5, feedbackMode: "IMMEDIATE" });
    await saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: "A", timeSpentMs: 1000 });
    const fb = await revealFeedback(user.id, attempt.id, mtqs[0].id);
    expect(fb.correctOption).toBe(mtqs[0].correctOptionSnapshot);
    await expect(saveAnswer(user.id, attempt.id, { mockTestQuestionId: mtqs[0].id, selectedOption: "B", timeSpentMs: 2000 })).rejects.toMatchObject({ status: 409 });
  });
});

describe("learning profile", () => {
  it("updates topic states after submission and personalises the next mock", async () => {
    const t0 = new Date("2026-07-01T09:00:00Z");
    const { user, attempt, mtqs } = await fresh("TOPIC_PRACTICE", { topicId: "ar-percentage", questionCount: 10, feedbackMode: "END_OF_SET" }, t0);
    let clock = t0.getTime();
    for (const m of mtqs) {
      clock += 30_000;
      await saveAnswer(user.id, attempt.id, { mockTestQuestionId: m.id, selectedOption: m.correctOptionSnapshot === "A" ? "B" : "A", timeSpentMs: 30_000 }, new Date(clock));
    }
    await submitAttempt(user.id, attempt.id, { now: new Date(clock) });
    const state = await prisma.studentSkillState.findUniqueOrThrow({ where: { userId_level_nodeId: { userId: user.id, level: "TOPIC", nodeId: "ar-percentage" } } });
    expect(state).toMatchObject({ state: "WEAK", attempts: mtqs.length, correct: 0 });
    expect(await prisma.masterySnapshot.count({ where: { attemptId: attempt.id } })).toBeGreaterThan(0);
    const recs = await prisma.recommendation.findMany({ where: { userId: user.id, status: "ACTIVE" } });
    expect(recs.some((r) => r.nodeId === "ar-percentage" && r.reason.length > 0)).toBe(true);

    const next = await createMock(user.id, { type: "ADAPTIVE_WEAKNESS" }, { now: new Date(clock + 86_400_000) });
    const slot = (next.allocation as Array<{ topicId: string; count: number; category: string }>).find((s) => s.topicId === "ar-percentage")!;
    expect(["REMEDIATION", "REPEATED_ERRORS"]).toContain(slot.category);
    const items = await prisma.mockTestQuestion.findMany({ where: { mockTestId: next.id, topicIdSnapshot: "ar-percentage" } });
    expect(items.length).toBeGreaterThanOrEqual(3);
    // New questions on the weak topic, not the ones just answered.
    const seen = new Set(mtqs.map((m) => m.questionId));
    expect(items.every((i) => !seen.has(i.questionId))).toBe(true);
  });
});
