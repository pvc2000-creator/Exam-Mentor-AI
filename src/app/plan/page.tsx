import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { GateList } from "@/components/GateList";
import { StartMockButton, type StartMockOptions } from "@/components/StartMockButton";
import { STATE_LABEL, STATE_TONE } from "@/lib/labels";
import type { GateProgress, MasteryStateT } from "@/lib/engine/mastery";

export const metadata = { title: "My plan · ExamMentor AI" };

function actionFor(kind: string, topicId: string | null): (StartMockOptions & { label: string }) | null {
  switch (kind) {
    case "DIAGNOSTIC": return { type: "DIAGNOSTIC", label: "Start diagnostic" };
    case "REVIEW_CONCEPT":
    case "TARGETED_PRACTICE": return topicId ? { type: "TOPIC_PRACTICE", topicId, feedbackMode: "IMMEDIATE", label: "Practise now" } : null;
    case "RETRY_SIMILAR":
    case "REASSESS": return topicId ? { type: "TOPIC_PRACTICE", topicId, feedbackMode: "END_OF_SET", label: "Start" } : null;
    case "TIMED_DRILL": return { type: "SPEED_DRILL", label: "Start drill" };
    case "REVISE": return { type: "REVISION", label: "Start revision" };
    case "MIXED_ASSESSMENT": return { type: "MIXED", label: "Start mixed mock" };
    default: return null;
  }
}

export default async function PlanPage() {
  const user = await requirePageUser();
  const [recs, catalog, states] = await Promise.all([
    prisma.recommendation.findMany({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { priority: "desc" }, take: 12 }),
    topicCatalog(),
    prisma.studentSkillState.findMany({ where: { userId: user.id, level: "TOPIC" } }),
  ]);
  const sMap = new Map(states.map((s) => [s.nodeId, s]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="My study plan"
        subtitle="Generated from your own answers after every test. Each step says why it is here and what you need to show to move on."
        action={<StartMockButton type="ADAPTIVE_WEAKNESS" label="Next personalised mock" />}
      />
      {recs.length === 0 ? (
        <Empty title="No plan yet">Take the <Link className="underline" href="/mocks">diagnostic baseline</Link> and your plan will appear here.</Empty>
      ) : (
        <ol className="space-y-4">
          {recs.map((r, i) => {
            const st = r.nodeId ? sMap.get(r.nodeId) : undefined;
            const state = (st?.state ?? "NOT_STARTED") as MasteryStateT;
            const act = actionFor(r.kind, r.nodeId);
            return (
              <li key={r.id}>
                <Card
                  title={<span><span className="mr-2 text-slate-400">{i + 1}.</span>{r.title}</span>}
                  subtitle={r.nodeId ? <><Link className="underline" href={`/syllabus/${r.nodeId}`}>{catalog.topicName.get(r.nodeId) ?? r.nodeId}</Link> <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge></> : undefined}
                  action={act ? <StartMockButton {...act} /> : undefined}
                >
                  <p className="text-sm text-slate-700"><strong>Why:</strong> {r.reason}</p>
                  {st && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-brand-700">What you need to demonstrate</summary>
                      <div className="mt-2"><GateList gate={st.gateProgress as unknown as GateProgress} /></div>
                    </details>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
