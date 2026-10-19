import { prisma } from "@/lib/server/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PostButton } from "@/components/admin/PostButton";
import { SyllabusUpload } from "@/components/admin/SyllabusUpload";

export const metadata = { title: "Syllabus versions · Admin" };

export default async function SyllabusAdmin() {
  const versions = await prisma.syllabusVersion.findMany({ orderBy: { createdAt: "desc" }, include: { exam: { select: { name: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Syllabus and exam-pattern versions" subtitle="Each version is a validated JSON configuration (pattern, sections, marking, topics, sources). Mocks record the version they were built from, so old results stay interpretable after a change." />
      <Card title="Versions">
        <ul className="divide-y divide-slate-100 text-sm">
          {versions.map((v) => {
            const cfg = v.config as { pattern?: { totalQuestions: number; durationMinutes: number; marking: { correct: number; incorrect: number } } };
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{v.version} · {v.cycle} {v.isActive && <Badge tone="green">active</Badge>}</p>
                  <p className="text-xs text-slate-500">{v.verification.replace(/_/g, " ").toLowerCase()} · {cfg.pattern ? `${cfg.pattern.totalQuestions} Q / ${cfg.pattern.durationMinutes} min, +${cfg.pattern.marking.correct}/${cfg.pattern.marking.incorrect}` : ""} · installed {v.createdAt.toISOString().slice(0, 10)}</p>
                  {v.notes && <p className="text-xs text-slate-500">{v.notes}</p>}
                </div>
                {!v.isActive && <PostButton url={`/api/admin/syllabus/${v.id}/activate`} label="Activate" confirm="New mocks will use this version." />}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Upload a new version" subtitle="The file is checked for internal consistency (section totals, marks, marking scheme, unique ids) before it is stored."><SyllabusUpload /></Card>
    </div>
  );
}
