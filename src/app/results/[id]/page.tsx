import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ERROR_LABEL, type ErrorCategoryT } from "@/lib/engine/errors";
import { MOCK_TYPE_LABEL, SLOT_LABEL, pct, secs, originLabel } from "@/lib/labels";
import type { QuestionOption } from "@/lib/questions/types";
import type { Breakdown } from "@/lib/engine/scoring";
import { TutorPanel } from "@/components/TutorPanel";
import { StartMockButton } from "@/components/StartMockButton";

export const metadata = { title: "Results · ExamMentor AI" };

export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const attempt = await prisma.attempt.findFirst({
    where: { id, userId: user.id },
    include: {
      mockTest: { include: { questions: { orderBy: { position: "asc" } } } },
      responses: { include: { question: true, mockTestQuestion: true } },
    },
  });
  if (!attempt) notFound();
  if (attempt.status === "IN_PROGRESS") redirect(`/attempt/${id}`);
  const [cat, previous, recs] = await Promise.all([
    topicCatalog(),
    prisma.attempt.findMany({ where: { userId: user.id, status: { not: "IN_PROGRESS" }, submittedAt: { lt: attempt.submittedAt ?? new Date() } }, orderBy: { submittedAt: "desc" }, take: 5, include: { mockTest: { select: { type: true, title: true } } } }),
    prisma.recommendation.findMany({ where: { userId: user.id, attemptId: id }, orderBy: { priority: "desc" }, take: 6 }),
  ]);
  const summary = (attempt.summary ?? {}) as { percentage?: number; bySubject?: Record<string, Breakdown>; byTopic?: Record<string, Breakdown>; errorPatterns?: Array<{ category: ErrorCategoryT; count: number; weight: number; status: string }> };
  const responses = [...attempt.responses].sort((a, b) => a.mockTestQuestion.position - b.mockTestQuestion.position);
  const expected = (r: (typeof responses)[number]) => r.question.expectedTimeSec * 1000;
  const quad = { fastRight: 0, slowRight: 0, fastWrong: 0, slowWrong: 0 };
  for (const r of responses) {
    if (r.isCorrect === null) continue;
    const slow = r.timeSpentMs > expected(r);
    if (r.isCorrect) slow ? quad.slowRight++ : quad.fastRight++;
    else slow ? quad.slowWrong++ : quad.fastWrong++;
  }
  const sameType = previous.find((p) => p.mockTest.type === attempt.mockTest.type);
  const prevPct = sameType?.maxScore ? (sameType.score ?? 0) / sameType.maxScore : null;
  const curPct = attempt.maxScore ? (attempt.score ?? 0) / attempt.maxScore : 0;
  const slotCounts = new Map<string, number>();
  for (const q of attempt.mockTest.questions) slotCounts.set(q.slotCategory, (slotCounts.get(q.slotCategory) ?? 0) + 1);
  const shortages = (attempt.mockTest.shortages ?? []) as Array<{ topicId: string; note: string }>;
  const topicRows = Object.entries(summary.byTopic ?? {}).sort((a, b) => (a[1].accuracy ?? -1) - (b[1].accuracy ?? -1));

  return (
    <div className="space-y-6">
      <PageHeader
        title={attempt.mockTest.title}
        subtitle={`${MOCK_TYPE_LABEL[attempt.mockTest.type]} · submitted ${attempt.submittedAt?.toLocaleString("en-IN")}${attempt.status === "AUTO_SUBMITTED" ? " automatically when time ran out" : ""}`}
        action={<StartMockButton type="ADAPTIVE_WEAKNESS" label="Next personalised mock" />}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Score" value={`${attempt.score} / ${attempt.maxScore}`} hint={`${summary.percentage ?? Math.round(curPct * 100)}%`} />
        <Stat label="Correct" value={attempt.correctCount} />
        <Stat label="Incorrect" value={attempt.incorrectCount} />
        <Stat label="Unanswered" value={attempt.unansweredCount} />
        <Stat label="Time spent" value={`${Math.floor((attempt.timeSpentSec ?? 0) / 60)} min`} hint={`of ${Math.round(attempt.mockTest.durationSec / 60)} min`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Compared with your previous attempts" subtitle="Only your own history is used; there is no comparison with other students.">
          {previous.length ? (
            <ul className="space-y-1 text-sm">
              {sameType && <li>Last {MOCK_TYPE_LABEL[attempt.mockTest.type].toLowerCase()}: {pct(prevPct)} → now {pct(curPct)} <Badge tone={curPct >= (prevPct ?? 0) ? "green" : "red"}>{curPct >= (prevPct ?? 0) ? "+" : ""}{Math.round((curPct - (prevPct ?? 0)) * 100)} pts</Badge></li>}
              {previous.slice(0, 4).map((p) => <li key={p.id} className="text-slate-600">{p.mockTest.title}: {pct(p.maxScore ? (p.score ?? 0) / p.maxScore : 0)} <span className="text-xs">({p.submittedAt?.toLocaleDateString("en-IN")})</span></li>)}
            </ul>
          ) : <p className="muted">This is your first completed test.</p>}
        </Card>
        <Card title="Speed and accuracy" subtitle="Compared with each question's expected solving time">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-bold">{quad.fastRight}</p><p>Quick and correct</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-bold">{quad.slowRight}</p><p>Correct but slow, costs time elsewhere</p></div>
            <div className="rounded-lg bg-red-50 p-3"><p className="text-2xl font-bold">{quad.fastWrong}</p><p>Quick but wrong, check for rushing</p></div>
            <div className="rounded-lg bg-slate-100 p-3"><p className="text-2xl font-bold">{quad.slowWrong}</p><p>Slow and wrong, likely a concept gap</p></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By subject">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Subject</th><th>Score</th><th>Accuracy</th><th>Unanswered</th></tr></thead>
            <tbody>{Object.entries(summary.bySubject ?? {}).map(([sid, b]) => <tr key={sid} className="border-t border-slate-100"><td className="py-1.5">{cat.subjects.find((s) => s.id === sid)?.name ?? sid}</td><td>{b.score}/{b.maxScore}</td><td>{pct(b.accuracy)}</td><td>{b.unanswered}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Error patterns in this test" subtitle="'Possible' means the evidence is not yet strong enough to call it a pattern">
          {summary.errorPatterns?.length ? (
            <ul className="space-y-2 text-sm">
              {summary.errorPatterns.map((p) => (
                <li key={p.category} className="flex items-center justify-between">
                  <span>{ERROR_LABEL[p.category]}</span>
                  <span className="flex items-center gap-2"><span className="text-slate-500">{p.count}×</span><Badge tone={p.status === "recurring" ? "red" : "gray"}>{p.status}</Badge></span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No incorrect or unanswered questions.</p>}
        </Card>
      </div>

      <Card title="By topic" subtitle="Weakest first">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Topic</th><th>Correct</th><th>Accuracy</th><th>Avg time</th></tr></thead>
            <tbody>{topicRows.map(([tid, b]) => <tr key={tid} className="border-t border-slate-100"><td className="py-1.5"><Link className="hover:underline" href={`/syllabus/${tid}`}>{cat.topicName.get(tid) ?? tid}</Link></td><td>{b.correct}/{b.correct + b.incorrect + b.unanswered}</td><td>{pct(b.accuracy)}</td><td>{secs(b.timeMs / Math.max(1, b.correct + b.incorrect + b.unanswered))}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      {recs.length > 0 && (
        <Card title="What to do next" subtitle="Generated from your updated learning profile">
          <ul className="grid gap-3 md:grid-cols-2">{recs.map((r) => <li key={r.id} className="rounded-lg border border-slate-200 p-3"><p className="font-medium">{r.title}</p><p className="mt-0.5 text-sm text-slate-600">{r.reason}</p></li>)}</ul>
        </Card>
      )}

      <Card title="Why these questions were chosen" subtitle={`Seed ${attempt.mockTest.seed} · policy ${(attempt.mockTest.selectionCriteria as { policyVersion?: string }).policyVersion ?? ""}`}>
        <div className="flex flex-wrap gap-2">{[...slotCounts.entries()].map(([k, v]) => <Badge key={k} tone="blue">{SLOT_LABEL[k] ?? k}: {v}</Badge>)}</div>
        {shortages.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-amber-800">{shortages.map((s, i) => <li key={i}>{cat.topicName.get(s.topicId)}: {s.note}</li>)}</ul>}
      </Card>

      <Card title="Question-by-question review">
        <ol className="space-y-3">
          {responses.map((r) => {
            const opts = r.question.options as unknown as QuestionOption[];
            const correctKey = r.mockTestQuestion.correctOptionSnapshot;
            const ev = (r.errorEvidence ?? null) as { evidence?: string[] } | null;
            const lab = originLabel(r.question.origin, r.question.verificationStatus);
            return (
              <li key={r.id} className="rounded-lg border border-slate-200">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 text-sm">
                    <span className="w-8 font-semibold text-slate-500">{r.mockTestQuestion.position}.</span>
                    <Badge tone={r.isCorrect ? "green" : r.isCorrect === false ? "red" : "gray"}>{r.isCorrect ? "Correct" : r.isCorrect === false ? "Incorrect" : "Unanswered"}</Badge>
                    <span className="line-clamp-1 flex-1">{r.question.stem}</span>
                    <span className="text-xs text-slate-500">{secs(r.timeSpentMs)} / {r.question.expectedTimeSec} s</span>
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-4 text-sm">
                    <p className="whitespace-pre-line">{r.question.stem}</p>
                    {r.question.stemHi && <p className="text-slate-600">{r.question.stemHi}</p>}
                    <ul className="space-y-1">
                      {opts.map((o) => (
                        <li key={o.key} className={o.key === correctKey ? "font-semibold text-emerald-700" : o.key === r.selectedOption ? "text-red-700" : ""}>
                          {o.key}. {o.text} {o.key === correctKey && "✓"} {o.key === r.selectedOption && o.key !== correctKey && "(your answer)"}
                          {o.key === r.selectedOption && o.key !== correctKey && o.rationale && <span className="block pl-5 text-xs text-slate-600">Why it is wrong: {o.rationale}</span>}
                        </li>
                      ))}
                    </ul>
                    {r.question.explanation && <p className="rounded bg-slate-50 p-3"><strong>Explanation:</strong> {r.question.explanation}</p>}
                    {r.errorCategory && (
                      <div className="rounded bg-amber-50 p-3 text-amber-900">
                        <p><strong>{r.errorIsTentative ? "Possible cause" : "Likely cause"}:</strong> {ERROR_LABEL[r.errorCategory as ErrorCategoryT]} <span className="text-xs">(confidence {Math.round((r.errorConfidence ?? 0) * 100)}%)</span></p>
                        {ev?.evidence?.length ? <ul className="mt-1 list-disc pl-5 text-xs">{ev.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge tone={lab.tone}>{lab.text}</Badge><span>{cat.topicName.get(r.topicId)}</span><span>· {r.difficulty.toLowerCase()}</span></div>
                    {r.isCorrect !== true && <TutorPanel questionId={r.questionId} selectedOption={r.selectedOption} />}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
