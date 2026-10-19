import Link from "next/link";
import type { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { originLabel } from "@/lib/labels";
import type { QuestionOption } from "@/lib/questions/types";

export const metadata = { title: "Review queue · Admin" };
const PAGE = 10;
const STATUSES: VerificationStatus[] = ["PENDING_REVIEW", "PROVISIONAL", "VERIFIED", "REJECTED"];

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ status?: string; topic?: string; page?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES.includes(sp.status as VerificationStatus) ? sp.status : "PENDING_REVIEW") as VerificationStatus;
  const page = Math.max(1, Number(sp.page) || 1);
  const catalog = await topicCatalog();
  const topic = sp.topic && catalog.topicName.has(sp.topic) ? sp.topic : undefined;
  const search = sp.q?.trim().slice(0, 100);
  const where: Prisma.QuestionWhereInput = { verificationStatus: status, ...(topic ? { topicId: topic } : {}), ...(search ? { stem: { contains: search, mode: "insensitive" } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, include: { reviewEvents: { orderBy: { createdAt: "desc" }, take: 3 }, source: { select: { title: true } } } }),
  ]);
  const topics = catalog.subjects.flatMap((s) => s.topics.map((t) => ({ id: t.id, name: `${s.name} › ${t.name}` })));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => `/admin/questions?status=${status}${topic ? `&topic=${topic}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}&page=${p}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Question review" subtitle="Approving marks a question as verified by human review. AI-authored questions stay provisional until a person approves them; nothing is labelled as an official previous-year question unless it came from a recorded paper." />
      <form className="flex flex-wrap items-end gap-2" action="/admin/questions">
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" className="input" defaultValue={status}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select></div>
        <div><label className="label" htmlFor="topic">Topic</label><select id="topic" name="topic" className="input" defaultValue={topic ?? ""}><option value="">All</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="q">Text contains</label><input id="q" name="q" className="input" defaultValue={search ?? ""} /></div>
        <button className="btn-secondary" type="submit">Filter</button>
      </form>
      <p className="muted">{total} question{total === 1 ? "" : "s"}</p>
      {rows.length === 0 ? <Empty title="Nothing here" /> : rows.map((q) => {
        const opts = q.options as unknown as QuestionOption[];
        const o = originLabel(q.origin, q.verificationStatus);
        return (
          <Card key={q.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <code>{q.id}</code>
              <Badge tone={o.tone}>{o.text}</Badge>
              <Badge>{q.difficulty.toLowerCase()}</Badge>
              <span>{catalog.topicName.get(q.topicId)}</span>
              {q.source && <span className="text-slate-500">Source: {q.source.title}{q.sourceRef ? ` (${q.sourceRef})` : ""}</span>}
              {q.qualityFlags.map((f) => <Badge key={f} tone="amber">{f.replace(/_/g, " ").toLowerCase()}</Badge>)}
            </div>
            <p className="font-medium">{q.stem}</p>
            {q.stemHi && <p className="text-sm text-slate-600">{q.stemHi}</p>}
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {opts.map((op) => <li key={op.key} className={op.key === q.correctOption ? "font-semibold text-emerald-700" : ""}>{op.key}. {op.text}{op.key === q.correctOption ? " ✓" : ""}</li>)}
            </ol>
            {q.explanation && <p className="mt-2 text-sm text-slate-600">{q.explanation}</p>}
            {q.reviewNotes && <p className="mt-1 text-xs text-amber-800">Note: {q.reviewNotes}</p>}
            {q.reviewEvents.length > 0 && <p className="mt-1 text-xs text-slate-500">History: {q.reviewEvents.map((e) => `${e.createdAt.toISOString().slice(0, 10)} ${e.fromStatus}→${e.toStatus}`).join(", ")}</p>}
            <QuestionEditor q={{ id: q.id, stem: q.stem, stemHi: q.stemHi, options: opts.map((x) => ({ key: x.key, text: x.text })), correctOption: q.correctOption, explanation: q.explanation, difficulty: q.difficulty, topicId: q.topicId }} topics={topics} />
          </Card>
        );
      })}
      {pages > 1 && (
        <nav className="flex gap-3 text-sm" aria-label="Pagination">
          {page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages && <Link className="underline" href={href(page + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
