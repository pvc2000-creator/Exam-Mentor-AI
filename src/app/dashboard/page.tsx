import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";
import { getDashboard } from "@/lib/server/queries";
import { Badge, Card, Empty, PageHeader, Progress, Stat } from "@/components/ui";
import { ScoreTrend, SubjectBars } from "@/components/Charts";
import { STATE_LABEL, STATE_TONE, STATE_HELP, pct, secs, MOCK_TYPE_LABEL } from "@/lib/labels";
import { ERROR_LABEL, type ErrorCategoryT } from "@/lib/engine/errors";
import { StartMockButton } from "@/components/StartMockButton";
import type { MasteryStateT } from "@/lib/engine/mastery";

export const metadata = { title: "Dashboard · ExamMentor AI" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requirePageUser();
  const d = await getDashboard(user.id);
  const { welcome } = await searchParams;
  const fresh = d.attempts.length === 0;
  const trend = [...d.attempts].reverse().map((a, i) => ({ label: `#${i + 1}`, score: Math.round(a.pct * 100), accuracy: a.correct !== null && a.incorrect !== null && a.correct + a.incorrect > 0 ? Math.round((a.correct / (a.correct + a.incorrect)) * 100) : null }));
  const totalTopics = Object.values(d.stateCounts).reduce((s, x) => s + x, 0);
  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle="Your private learning profile. Every number here comes only from your own answers." action={<StartMockButton type="ADAPTIVE_WEAKNESS" label={fresh ? "Start diagnostic" : "Next personalised mock"} diagnosticIfNew={fresh} />} />

      {d.inProgress && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50">
          <div><p className="font-semibold">You have an unfinished test: {d.inProgress.mockTest.title}</p><p className="muted">Your answers are saved. It will be submitted automatically when time runs out.</p></div>
          <Link className="btn-primary" href={`/attempt/${d.inProgress.id}`}>Resume</Link>
        </div>
      )}

      {fresh ? (
        <Card title={welcome ? "Welcome! Let's find your starting point" : "Start with a diagnostic"}>
          <p className="text-sm text-slate-600">The diagnostic baseline is a 30-question test covering every topic in proportion to the syllabus. It takes about 36 minutes. After it, the mentor builds your learning profile and your first personalised mock.</p>
          <div className="mt-4 flex flex-wrap gap-3"><StartMockButton type="DIAGNOSTIC" label="Take the diagnostic baseline" /><Link href="/practice" className="btn-secondary">Or practise one topic first</Link></div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Latest score" value={pct(d.attempts[0]?.pct)} hint={`${d.attempts[0]?.title ?? ""}`} />
            <Stat label="Accuracy (attempted)" value={pct(d.totals.accuracy)} hint={`${d.totals.correct} of ${d.totals.answered} answered correctly`} />
            <Stat label="Questions attempted" value={d.totals.answered} hint={`${d.totals.questions - d.totals.answered} left unanswered`} />
            <Stat label="Avg. time per question" value={secs(d.totals.avgTimeMs)} hint="Exam allows ~72 s per question" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Recommended next" subtitle="Ordered by priority; each has a reason from your data" className="lg:col-span-2" action={<Link href="/plan" className="text-sm text-brand-600 underline">Full plan</Link>}>
              <ul className="space-y-3">
                {d.recs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-medium">{r.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Mastery progress" subtitle={`${totalTopics} topics in the syllabus`}>
              <ul className="space-y-2 text-sm">
                {(Object.keys(d.stateCounts) as MasteryStateT[]).map((s) => (
                  <li key={s} className="flex items-center justify-between" title={STATE_HELP[s]}>
                    <Badge tone={STATE_TONE[s]}>{STATE_LABEL[s]}</Badge>
                    <span className="font-medium">{d.stateCounts[s]}</span>
                  </li>
                ))}
              </ul>
              <p className="muted mt-3 text-xs">Hover a label for its meaning. Mastery needs repeated, varied evidence and a retention check.</p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Progress over time" subtitle="Score in each completed test (solid) and accuracy on attempted questions (dashed)">
              {trend.length >= 2 ? <ScoreTrend data={trend} /> : <Empty title="Complete one more test to see a trend" />}
            </Card>
            <Card title="Accuracy by subject" subtitle="Below the 50% line means more wrong than right">
              <SubjectBars data={d.subjects.filter((s) => s.attempted > 0).map((s) => ({ name: s.name, accuracy: Math.round((s.correct / s.attempted) * 100) }))} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Weak topics" subtitle="Lowest estimated mastery first">
              {d.weak.length ? (
                <ul className="space-y-3">
                  {d.weak.map((t) => (
                    <li key={t.nodeId}>
                      <div className="flex justify-between text-sm"><Link className="font-medium hover:underline" href={`/syllabus/${t.nodeId}`}>{t.name}</Link><span className="text-slate-500">{pct(t.masteryScore)} · {t.attempts} answers</span></div>
                      <Progress value={t.masteryScore * 100} tone="red" label={`${t.name} mastery`} />
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No weak topics right now" />}
            </Card>
            <Card title="Strong topics" subtitle="Still revised periodically">
              {d.strong.length ? (
                <ul className="space-y-3">
                  {d.strong.map((t) => (
                    <li key={t.nodeId}>
                      <div className="flex justify-between text-sm"><Link className="font-medium hover:underline" href={`/syllabus/${t.nodeId}`}>{t.name}</Link><Badge tone={STATE_TONE[t.state as MasteryStateT]}>{STATE_LABEL[t.state as MasteryStateT]}</Badge></div>
                      <Progress value={t.masteryScore * 100} tone="green" label={`${t.name} mastery`} />
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No topic has met the proficiency gates yet">Proficiency needs at least 8 answers on 6 different questions with 80% recent accuracy.</Empty>}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Recent mistakes" action={<Link href="/review" className="text-sm text-brand-600 underline">Review all</Link>}>
              <ul className="divide-y divide-slate-100 text-sm">
                {d.recentWrong.map((r) => (
                  <li key={r.id} className="py-2">
                    <p className="line-clamp-2">{r.question.stem}</p>
                    <p className="mt-1 text-xs text-slate-500">{d.catalog.topicName.get(r.topicId)} · {r.errorCategory ? `${r.errorIsTentative ? "Possible: " : ""}${ERROR_LABEL[r.errorCategory as ErrorCategoryT]}` : ""}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Recent tests" action={<Link href="/mocks" className="text-sm text-brand-600 underline">All tests</Link>}>
              <ul className="divide-y divide-slate-100 text-sm">
                {d.attempts.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <div><Link href={`/results/${a.id}`} className="font-medium hover:underline">{a.title}</Link><p className="text-xs text-slate-500">{MOCK_TYPE_LABEL[a.type]} · {a.submittedAt?.toLocaleDateString("en-IN")}{a.status === "AUTO_SUBMITTED" ? " · auto-submitted" : ""}</p></div>
                    <span className="font-semibold">{a.score}/{a.maxScore}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {d.milestones.length > 0 && (
            <Card title="Milestones">
              <ul className="space-y-1 text-sm">{d.milestones.map((m) => <li key={m.id}><Badge tone={m.kind === "MASTERY_ACHIEVED" || m.kind === "RETENTION_CONFIRMED" ? "green" : "amber"}>{m.kind.replace(/_/g, " ").toLowerCase()}</Badge> <span className="ml-2">{m.name}</span> <span className="text-xs text-slate-500">{m.createdAt.toLocaleDateString("en-IN")}</span></li>)}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
