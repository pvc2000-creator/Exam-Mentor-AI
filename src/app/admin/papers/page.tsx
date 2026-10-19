import { paperAnalysis } from "@/lib/server/admin";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { PostButton } from "@/components/admin/PostButton";
import { pct } from "@/lib/labels";

export const metadata = { title: "Paper analysis · Admin" };

export default async function PapersPage() {
  const a = await paperAnalysis();
  return (
    <div className="space-y-6">
      <PageHeader title="Previous-year paper analysis" subtitle={a.reliability} />
      <Card title="Papers" subtitle="A paper counts in the analysis only after an admin marks it verified against an official source.">
        {a.papers.length === 0 ? <Empty title="No papers recorded">Import a JSON file with a paper block, or a PDF with an answer key, to add one.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {a.papers.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{p.title} ({p.year}) · {p.questionCount} questions {p.isVerified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}</span>
                <PostButton url={`/api/admin/papers/${p.id}/verify`} body={{ isVerified: !p.isVerified }} label={p.isVerified ? "Mark unverified" : "Mark verified"} confirm={p.isVerified ? undefined : "Confirm you checked it against an official source."} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Topic distribution" subtitle={`Configured share versus observed share in ${a.verifiedCount} verified paper(s), ${a.totalQuestions} questions.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Subject</th><th>Topic</th><th>Configured share</th><th>Observed</th><th>Observed share</th></tr></thead>
            <tbody>{a.topics.map((t) => <tr key={t.topicId} className="border-t border-slate-100"><td className="py-1">{t.subject}</td><td>{t.name}</td><td>{pct(t.configShare, 1)}</td><td>{t.observed}</td><td>{pct(t.observedShare, 1)}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
