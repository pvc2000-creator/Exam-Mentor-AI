import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { expireOverdue } from "@/lib/server/mocks";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { MockPicker } from "@/components/MockPicker";
import { MOCK_TYPE_LABEL, pct } from "@/lib/labels";

export const metadata = { title: "Mocks · ExamMentor AI" };
const PAGE = 15;

export default async function MocksPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser();
  await expireOverdue(user.id);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [catalog, total, attempts] = await Promise.all([
    topicCatalog(),
    prisma.attempt.count({ where: { userId: user.id } }),
    prisma.attempt.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { mockTest: { select: { type: true, title: true, questionCount: true, seed: true } } } }),
  ]);
  const subjects = catalog.subjects.map((s) => ({ id: s.id, name: s.name, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) }));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="space-y-6">
      <PageHeader title="Mock tests" subtitle="Every mock records its seed, allocation and selection rules, so you can see why each question was chosen." />
      <Card title="Start a new test"><MockPicker subjects={subjects} /></Card>
      <Card title="History" subtitle={`${total} test${total === 1 ? "" : "s"}`}>
        {attempts.length === 0 ? (
          <Empty title="No tests yet">Start with the diagnostic baseline or a personalised mock above.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Test</th><th>Type</th><th>Date</th><th>Status</th><th className="text-right">Score</th><th /></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-2">{a.mockTest.title}<span className="ml-2 text-xs text-slate-400">seed {a.mockTest.seed}</span></td>
                    <td>{MOCK_TYPE_LABEL[a.mockTest.type]}</td>
                    <td>{(a.submittedAt ?? a.startedAt).toISOString().slice(0, 10)}</td>
                    <td>{a.status === "IN_PROGRESS" ? <Badge tone="amber">In progress</Badge> : a.status === "AUTO_SUBMITTED" ? <Badge tone="purple">Auto-submitted</Badge> : <Badge tone="green">Submitted</Badge>}</td>
                    <td className="text-right">{a.status === "IN_PROGRESS" ? "–" : `${a.score ?? 0}/${a.maxScore ?? a.mockTest.questionCount} (${pct(a.maxScore ? (a.score ?? 0) / a.maxScore : 0)})`}</td>
                    <td className="pl-3 text-right">{a.status === "IN_PROGRESS" ? <Link className="text-brand-600 underline" href={`/attempt/${a.id}`}>Resume</Link> : <Link className="text-brand-600 underline" href={`/results/${a.id}`}>Results</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-4 flex gap-3 text-sm" aria-label="Pagination">
            {page > 1 && <Link className="underline" href={`/mocks?page=${page - 1}`}>Newer</Link>}
            <span className="text-slate-500">Page {page} of {pages}</span>
            {page < pages && <Link className="underline" href={`/mocks?page=${page + 1}`}>Older</Link>}
          </nav>
        )}
      </Card>
    </div>
  );
}
