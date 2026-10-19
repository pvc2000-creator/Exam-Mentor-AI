import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { topicErrorPatterns } from "@/lib/server/profile";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { GateList } from "@/components/GateList";
import { MasteryHistory } from "@/components/Charts";
import { StartMockButton } from "@/components/StartMockButton";
import { STATE_HELP, STATE_LABEL, STATE_TONE, pct, secs } from "@/lib/labels";
import { ERROR_LABEL } from "@/lib/engine/errors";
import type { GateProgress, MasteryStateT } from "@/lib/engine/mastery";

export const metadata = { title: "Topic · ExamMentor AI" };

export default async function TopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const user = await requirePageUser();
  const { topicId } = await params;
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { subject: true, subtopics: { orderBy: { sortOrder: "asc" }, include: { objectives: true } } } });
  if (!topic) notFound();
  const [state, subStates, snapshots, patterns, milestones] = await Promise.all([
    prisma.studentSkillState.findUnique({ where: { userId_level_nodeId: { userId: user.id, level: "TOPIC", nodeId: topicId } } }),
    prisma.studentSkillState.findMany({ where: { userId: user.id, level: "SUBTOPIC", nodeId: { in: topic.subtopics.map((s) => s.id) } } }),
    prisma.masterySnapshot.findMany({ where: { userId: user.id, level: "TOPIC", nodeId: topicId }, orderBy: { createdAt: "asc" }, take: 50 }),
    topicErrorPatterns(user.id, new Date(Date.now() - 60 * 86_400_000)),
    prisma.masteryMilestone.findMany({ where: { userId: user.id, nodeId: topicId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const s = (state?.state ?? "NOT_STARTED") as MasteryStateT;
  const subMap = new Map(subStates.map((x) => [x.nodeId, x]));
  const errs = patterns.get(topicId) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={topic.name}
        subtitle={<><Link className="underline" href="/syllabus">{topic.subject.name}</Link>{topic.nameHi ? ` · ${topic.nameHi}` : ""}</>}
        action={
          <div className="flex flex-wrap gap-2">
            <StartMockButton type="TOPIC_PRACTICE" topicId={topicId} feedbackMode="IMMEDIATE" label="Practise with instant feedback" />
            <StartMockButton type="TOPIC_PRACTICE" topicId={topicId} feedbackMode="END_OF_SET" questionCount={10} className="btn-secondary" label="Timed topic test" />
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="State" value={<Badge tone={STATE_TONE[s]}>{STATE_LABEL[s]}</Badge>} hint={STATE_HELP[s]} />
        <Stat label="Estimated mastery" value={pct(state?.masteryScore)} hint={state ? `Confidence ${pct(state.confidence)} (grows with more varied answers)` : "No data"} />
        <Stat label="Accuracy" value={pct(state?.accuracy)} hint={state ? `${state.correct} correct of ${state.attempts}; recent ${pct(state.recentAccuracy)}` : undefined} />
        <Stat label="Median time" value={secs(state?.medianTimeMs)} hint={state ? `${pct(state.slowShare)} of answers were slow` : undefined} />
      </div>
      {state?.stateReason && <p className="text-sm text-slate-700"><strong>Why this state:</strong> {state.stateReason}{state.nextAction ? ` Next: ${state.nextAction}` : ""}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What mastery needs" subtitle="Mastery is a set of gates, not one score. Each must be met, then confirmed after a revision interval.">
          <GateList gate={(state?.gateProgress as unknown as GateProgress) ?? null} />
        </Card>
        <Card title="Mastery over time" subtitle="Estimated mastery after each test that included this topic">
          {snapshots.length < 2 ? <p className="muted">The chart appears after two tests on this topic.</p> : <MasteryHistory data={snapshots.map((x, i) => ({ label: `#${i + 1}`, mastery: Math.round(x.masteryScore * 100) }))} />}
        </Card>
      </div>
      {topic.conceptNote && <Card title="Concept note"><p className="text-sm text-slate-700">{topic.conceptNote}</p></Card>}
      <Card title="Subtopics">
        <ul className="divide-y divide-slate-100 text-sm">
          {topic.subtopics.map((st) => {
            const x = subMap.get(st.id);
            const xs = (x?.state ?? "NOT_STARTED") as MasteryStateT;
            return (
              <li key={st.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{st.name}</p>
                  {st.objectives.length > 0 && <p className="text-xs text-slate-500">{st.objectives.map((o) => o.description).join("; ")}</p>}
                </div>
                <span className="flex items-center gap-2"><Badge tone={STATE_TONE[xs]}>{STATE_LABEL[xs]}</Badge><span className="text-slate-500">{x ? `${x.correct}/${x.attempts} correct` : ""}</span></span>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Error patterns (last 60 days)" subtitle="A pattern is called recurring only with at least two confident diagnoses.">
          {errs.length === 0 ? <p className="muted">No classified mistakes on this topic.</p> : (
            <ul className="space-y-1 text-sm">
              {errs.map((e) => <li key={e.category} className="flex justify-between"><span>{ERROR_LABEL[e.category]}</span><span className="text-slate-500">{e.count}× · {e.status}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Milestones">
          {milestones.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="space-y-1 text-sm">{milestones.map((m) => <li key={m.id}><span className="text-slate-500">{m.createdAt.toISOString().slice(0, 10)}</span> {m.kind.replace(/_/g, " ").toLowerCase()}: {m.detail}</li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
