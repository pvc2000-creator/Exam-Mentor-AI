import { dataQuality } from "@/lib/server/admin";
import { Card, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Data quality · Admin" };

export default async function QualityPage() {
  const q = await dataQuality();
  const thin = q.topics.filter((t) => t.fullMocksBeforeRepeat < 3);
  return (
    <div className="space-y-6">
      <PageHeader title="Data quality" subtitle="Generated from the database on each visit. The same report is written to research/data_quality_report.md by npm run report:quality." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Missing Hindi text" value={q.noHindi} />
        <Stat label="Missing explanation" value={q.noExplanation} />
        <Stat label="Flagged questions" value={Object.values(q.flagCounts).reduce((a, b) => a + b, 0)} hint={Object.entries(q.flagCounts).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join(", ")} />
        <Stat label="Difficulty calibration" value={`${q.calibration.miscalibrated}/${q.calibration.questionsWithEnoughData}`} hint="Questions whose observed correct rate disagrees with their label (needs ≥ 20 answers)" />
      </div>
      <Card title="Questions by origin and status">
        <ul className="text-sm">{q.byOrigin.map((r) => <li key={`${r.origin}-${r.status}`}>{r.origin.replace(/_/g, " ").toLowerCase()} · {r.status.replace(/_/g, " ").toLowerCase()}: {r.count}</li>)}</ul>
      </Card>
      <Card title="Coverage by topic" subtitle={`${thin.length} topic(s) have fewer than three full-length mocks' worth of eligible questions before repeats.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Topic</th><th>Eligible</th><th>Verified</th><th>Pending</th><th>Easy/Med/Hard</th><th>Per full mock</th><th>Mocks before repeat</th></tr></thead>
            <tbody>
              {q.topics.map((t) => (
                <tr key={t.topicId} className={`border-t border-slate-100 ${t.fullMocksBeforeRepeat < 3 ? "bg-amber-50" : ""}`}>
                  <td className="py-1">{t.name}</td><td>{t.eligible}</td><td>{t.verified}</td><td>{t.pending}</td><td>{t.easy}/{t.medium}/{t.hard}</td><td>{t.perFullMock}</td><td>{t.fullMocksBeforeRepeat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Sources">
        <ul className="space-y-1 text-sm">{q.sources.map((s) => <li key={s.id}><strong>{s.title}</strong> · {s.license ?? "licence not recorded"} · {s.allowsRepublish ? "may republish" : "reference only"}{s.notes ? ` · ${s.notes}` : ""}</li>)}</ul>
      </Card>
      {q.conflicts.length > 0 && <Card title="Known conflicts in exam information"><ul className="list-disc space-y-1 pl-5 text-sm">{q.conflicts.map((c) => <li key={c}>{c}</li>)}</ul></Card>}
    </div>
  );
}
