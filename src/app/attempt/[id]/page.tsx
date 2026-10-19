import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { expireOverdue } from "@/lib/server/mocks";
import { ExamRunner, type RunnerQuestion } from "@/components/ExamRunner";
import type { QuestionOption } from "@/lib/questions/types";
import { originLabel } from "@/lib/labels";

export const metadata = { title: "Test in progress · ExamMentor AI" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  await expireOverdue(user.id);
  const attempt = await prisma.attempt.findFirst({
    where: { id, userId: user.id },
    include: {
      mockTest: { include: { questions: { orderBy: { position: "asc" }, include: { question: { include: { topic: { select: { name: true, subject: { select: { name: true } } } } } } } } } },
      responses: true,
    },
  });
  if (!attempt) notFound();
  if (attempt.status !== "IN_PROGRESS") redirect(`/results/${attempt.id}`);
  const respByMtq = new Map(attempt.responses.map((r) => [r.mockTestQuestionId, r]));
  // Never send correct answers or explanations to the browser during a test.
  const questions: RunnerQuestion[] = attempt.mockTest.questions.map((mq) => {
    const q = mq.question;
    const r = respByMtq.get(mq.id);
    const label = originLabel(q.origin, q.verificationStatus);
    return {
      mtqId: mq.id,
      position: mq.position,
      subject: q.topic.subject.name,
      topic: q.topic.name,
      stem: q.stem,
      stemHi: q.stemHi,
      options: (q.options as unknown as QuestionOption[]).map((o) => ({ key: o.key, text: o.text, textHi: o.textHi })),
      sourceLabel: label.text,
      sourceTone: label.tone,
      selectedOption: r?.selectedOption ?? null,
      markedForReview: r?.markedForReview ?? false,
      timeSpentMs: r?.timeSpentMs ?? 0,
      visited: (r?.visits ?? 0) > 0 || !!r?.selectedOption,
      feedbackShown: r?.feedbackShown ?? false,
      selfConfidence: r?.selfConfidence ?? null,
    };
  });
  return (
    <ExamRunner
      attemptId={attempt.id}
      title={attempt.mockTest.title}
      deadline={attempt.deadlineAt.toISOString()}
      serverNow={new Date().toISOString()}
      feedbackMode={attempt.mockTest.feedbackMode}
      questions={questions}
      defaultLanguage={user.preferredLanguage}
      marking={attempt.mockTest.markingScheme as { correct: number; incorrect: number; unanswered: number }}
    />
  );
}
