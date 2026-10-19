import { prisma } from "@/lib/server/db";
import { topicCatalog } from "@/lib/server/queries";
import { maxUploadBytes } from "@/lib/server/upload";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/admin/ImportForm";

export const metadata = { title: "Import · Admin" };

export default async function ImportPage() {
  const [catalog, batches] = await Promise.all([topicCatalog(), prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 })]);
  const topics = catalog.subjects.flatMap((s) => s.topics.map((t) => ({ id: t.id, name: `${s.name} › ${t.name}` })));
  return (
    <div className="space-y-6">
      <PageHeader title="Import questions" subtitle="Each record is validated, fingerprinted and checked for duplicates. Everything imported goes to the review queue; nothing reaches students until approved. Only upload material you have the right to use." />
      <Card title="Upload">
        <ImportForm topics={topics} maxMb={Math.round(maxUploadBytes() / 1024 / 1024)} />
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer">File formats</summary>
          <p className="mt-2"><strong>CSV</strong> columns: topic_id, subtopic_id, skill_key, language, stem, stem_hi, option_a…option_d, option_a_hi…option_d_hi, correct_option, explanation, explanation_hi, difficulty, difficulty_basis, expected_time_sec, origin, is_synthetic, source_id, source_ref, paper_id, license. See <code>data/samples/questions-sample.csv</code>.</p>
          <p className="mt-1"><strong>JSON</strong>: {"{ paper?, source?, questions: [...] }"} with the same keys, or options as an array.</p>
          <p className="mt-1"><strong>PDF</strong>: numbered questions with (A)–(D) options and an answer line or answer key. Questions without an answer are listed as unresolved, never guessed.</p>
        </details>
      </Card>
      <Card title="Previous imports">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-1">File</th><th>Format</th><th>Date</th><th>Records</th><th>Added</th><th>Duplicates</th><th>Invalid</th><th>Flagged</th></tr></thead>
          <tbody>
            {batches.map((b) => <tr key={b.id} className="border-t border-slate-100"><td className="py-1">{b.fileName}</td><td>{b.format}</td><td>{b.createdAt.toISOString().slice(0, 10)}</td><td>{b.totalRecords}</td><td>{b.created}</td><td>{b.duplicates}</td><td>{b.invalid}</td><td>{b.flagged}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
