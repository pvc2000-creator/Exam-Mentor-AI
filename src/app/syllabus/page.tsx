import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { getActiveConfig } from "@/lib/server/syllabus";
import { topicCatalog } from "@/lib/server/queries";
import { Badge, Card, PageHeader, Progress } from "@/components/ui";
import { STATE_LABEL, STATE_TONE, pct } from "@/lib/labels";
import type { MasteryStateT } from "@/lib/engine/mastery";

export const metadata = { title: "Syllabus · ExamMentor AI" };

export default async function SyllabusPage() {
  const user = await requirePageUser();
  const [{ config, version }, catalog, states, counts] = await Promise.all([
    getActiveConfig(),
    topicCatalog(),
    prisma.studentSkillState.findMany({ where: { userId: user.id, level: "TOPIC" } }),
    prisma.question.groupBy({ by: ["topicId", "verificationStatus"], _count: true }),
  ]);
  const sMap = new Map(states.map((s) => [s.nodeId, s]));
  const bank = new Map<string, { eligible: number; pending: number }>();
  for (const c of counts) {
    const b = bank.get(c.topicId) ?? { eligible: 0, pending: 0 };
    if (c.verificationStatus === "VERIFIED" || c.verificationStatus === "PROVISIONAL") b.eligible += c._count;
    else if (c.verificationStatus === "PENDING_REVIEW") b.pending += c._count;
    bank.set(c.topicId, b);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Syllabus explorer"
        subtitle={<>Configuration {version} for {config.cycle}. Verification: <strong>{config.verification.replace(/_/g, " ").toLowerCase()}</strong>. {config.verificationNote}</>}
      />
      {catalog.subjects.map((s) => {
        const section = config.sections.find((x) => x.subjectId === s.id);
        return (
          <Card key={s.id} title={s.name} subtitle={section ? `${section.questions} questions in the full paper` : undefined}>
            <ul className="divide-y divide-slate-100">
              {s.topics.map((t) => {
                const st = sMap.get(t.id);
                const state = (st?.state ?? "NOT_STARTED") as MasteryStateT;
                const b = bank.get(t.id) ?? { eligible: 0, pending: 0 };
                return (
                  <li key={t.id} className="grid items-center gap-2 py-2.5 sm:grid-cols-[1fr_8rem_10rem_7rem]">
                    <div>
                      <Link className="font-medium text-slate-900 hover:underline" href={`/syllabus/${t.id}`}>{t.name}</Link>
                      {t.nameHi && <span className="ml-2 text-sm text-slate-500">{t.nameHi}</span>}
                      <p className="text-xs text-slate-500">{t.subtopics.map((x) => x.name).join(" · ")}</p>
                    </div>
                    <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                    <div className="flex items-center gap-2 text-xs text-slate-600"><Progress value={(st?.masteryScore ?? 0) * 100} label={`Mastery for ${t.name}`} /> {st ? pct(st.masteryScore) : "–"}</div>
                    <span className="text-xs text-slate-500">{b.eligible} questions{b.pending ? ` (+${b.pending} pending review)` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
