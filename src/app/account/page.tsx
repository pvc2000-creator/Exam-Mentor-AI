import { requirePageUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { Card, PageHeader } from "@/components/ui";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";

export const metadata = { title: "Account · ExamMentor AI" };

export default async function AccountPage() {
  const user = await requirePageUser();
  const [attempts, responses] = await Promise.all([prisma.attempt.count({ where: { userId: user.id } }), prisma.response.count({ where: { userId: user.id } })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Your account" subtitle={`${user.name} · ${user.email}`} />
      <Card title="Your data" subtitle="Your learning profile is visible only to you. Administrators can manage questions and syllabus, not read your answers through the app.">
        <p className="text-sm text-slate-700">Stored: {attempts} test attempts and {responses} answer records, plus the mastery estimates and recommendations derived from them.</p>
        <a className="btn-secondary mt-3 inline-block" href="/api/account/export" download>Download all my data (JSON)</a>
      </Card>
      <Card title="Delete account" subtitle="This removes your account, tests, answers, mastery history and recommendations. It cannot be undone.">
        <DeleteAccountForm />
      </Card>
    </div>
  );
}
