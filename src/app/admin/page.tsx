import { prisma } from "@/lib/server/db";
import { dataQuality } from "@/lib/server/admin";
import { Card, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Admin · ExamMentor AI" };

export default async function AdminHome() {
  const [q, students, attempts, audit] = await Promise.all([
    dataQuality(),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.attempt.count({ where: { status: { not: "IN_PROGRESS" } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle={`Active syllabus configuration ${q.version} (${q.verification.replace(/_/g, " ").toLowerCase()}). Student answers are not shown here; only aggregate counts.`} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Verified" value={q.totals.VERIFIED ?? 0} />
        <Stat label="Provisional" value={q.totals.PROVISIONAL ?? 0} />
        <Stat label="Pending review" value={q.totals.PENDING_REVIEW ?? 0} />
        <Stat label="Student accounts" value={students} />
        <Stat label="Completed tests" value={attempts} />
      </div>
      <Card title="Recent admin activity">
        <ul className="divide-y divide-slate-100 text-sm">
          {audit.map((a) => <li key={a.id} className="py-1.5"><span className="text-slate-500">{a.createdAt.toISOString().replace("T", " ").slice(0, 16)}</span> · {a.user?.name ?? "system"} · {a.action.replace(/_/g, " ").toLowerCase()} {a.target ? <code className="text-xs">{a.target}</code> : null}</li>)}
          {audit.length === 0 && <li className="muted py-1.5">No activity yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
