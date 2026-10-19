import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { StartMockButton } from "@/components/StartMockButton";
import { TutorPanel } from "@/components/TutorPanel";
import { ERROR_LABEL, type ErrorCategoryT } from "@/lib/engine/errors";
import type { QuestionOption } from "@/lib/questions/types";

export const metadata = { title: "Review · ExamMentor AI" };
const PAGE = 10;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ page?: string; topic?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const catalog = await topicCatalog();
  const topic = sp.topic && catalog.topicName.has(sp.topic) ? sp.topic : null;
  // Latest response per question; keep only those still wrong.
  const latest = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM (
      SELECT DISTINCT ON ("questionId") id, "isCorrect", "answeredAt", "topicId"
      FROM "Response" WHERE "userId" = ${user.id} AND scored = true AND "selectedOption" IS NOT NULL
      ORDER BY "questionId", "answeredAt" DESC NULLS LAST
    ) t WHERE t."isCorrect" = false AND (${topic}::text IS NULL OR t."topicId" = ${topic}::text)
    ORDER BY t."answeredAt" DESC NULLS LAST`;
  const total = latest.length;
  const ids = latest.slice((page - 1) * PAGE, page * PAGE).map((r) => r.id);
  const rows = await prisma.response.findMany({
    where: { id: { in: ids }, userId: user.id },
    include: { question: { select: { id: true, stem: true, options: true, correctOption: true, explanation: true } } },
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const byTopic = new Map<string, number>();
  const pages = Math.max(1, Math.ceil(total / PAGE));
  for (const r of rows) byTopic.set(r.topicId, (byTopic.get(r.topicId) ?? 0) + 1);
  const qs = (p: number) => `/review?page=${p}${topic ? `&topic=${topic}` : ""}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Review mistakes" subtitle="Questions whose most recent answer was wrong. Retrying uses different questions that test the same skill, so a correct retry shows understanding rather than memory of the answer." />
      <form className="flex items-end gap-2" action="/review">
        <div>
          <label className="label" htmlFor="topic">Filter by topic</label>
          <select id="topic" name="topic" defaultValue={topic ?? ""} className="input">
            <option value="">All topics</option>
            {catalog.subjects.map((s) => <optgroup key={s.id} label={s.name}>{s.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
          </select>
        </div>
        <button className="btn-secondary" type="submit">Apply</button>
      </form>
      {total === 0 ? (
        <Empty title="Nothing to review">Questions you get wrong will appear here until you answer them correctly.</Empty>
      ) : (
        <>
          <p className="muted">{total} question{total === 1 ? "" : "s"} to review.</p>
          {rows.map((r) => {
            const opts = r.question.options as unknown as QuestionOption[];
            const chosen = opts.find((o) => o.key === r.selectedOption);
            const right = opts.find((o) => o.key === r.question.correctOption);
            return (
              <Card key={r.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Link className="underline" href={`/syllabus/${r.topicId}`}>{catalog.topicName.get(r.topicId)}</Link>
                  {r.errorCategory && <Badge tone={r.errorIsTentative ? "gray" : "amber"} title={r.errorIsTentative ? "Tentative: limited evidence" : undefined}>{ERROR_LABEL[r.errorCategory as ErrorCategoryT]}{r.errorIsTentative ? " (tentative)" : ""}</Badge>}
                  <span className="text-slate-400">{r.answeredAt?.toISOString().slice(0, 10)}</span>
                </div>
                <p className="font-medium">{r.question.stem}</p>
                <p className="mt-2 text-sm"><span className="text-red-700">Your answer: {r.selectedOption}. {chosen?.text}</span> · <span className="text-emerald-700">Correct: {r.question.correctOption}. {right?.text}</span></p>
                {chosen?.rationale && <p className="mt-1 text-sm text-slate-600">{chosen.rationale}</p>}
                {r.question.explanation && <p className="mt-1 text-sm text-slate-700">{r.question.explanation}</p>}
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <StartMockButton type="TOPIC_PRACTICE" topicId={r.topicId} questionCount={5} feedbackMode="IMMEDIATE" className="btn-secondary text-xs" label="Retry similar questions" />
                </div>
                <TutorPanel questionId={r.question.id} selectedOption={r.selectedOption} />
              </Card>
            );
          })}
          {pages > 1 && (
            <nav className="flex gap-3 text-sm" aria-label="Pagination">
              {page > 1 && <Link className="underline" href={qs(page - 1)}>Previous</Link>}
              <span className="text-slate-500">Page {page} of {pages}</span>
              {page < pages && <Link className="underline" href={qs(page + 1)}>Next</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
