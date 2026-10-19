import type { GateProgress } from "@/lib/engine/mastery";
import { pct } from "@/lib/labels";

/** Shows each mastery gate with what the student has and what they still need to demonstrate. */
export function GateList({ gate }: { gate: GateProgress | null }) {
  if (!gate) return <p className="muted">No answers yet. Mastery needs evidence from several different questions.</p>;
  const rows: Array<[string, boolean, string]> = [
    ["Answers on this topic", gate.attempts.ok, `${gate.attempts.have} of ${gate.attempts.need}`],
    ["Different questions seen", gate.distinctQuestions.ok, `${gate.distinctQuestions.have} of ${gate.distinctQuestions.need}`],
    ["Different questions answered correctly", gate.distinctCorrect.ok, `${gate.distinctCorrect.have} of ${gate.distinctCorrect.need}`],
    ["Recent accuracy (last answers)", gate.recentAccuracy.ok, `${pct(gate.recentAccuracy.have)} (need ${pct(gate.recentAccuracy.need)})`],
    ["Correct at medium or hard difficulty", gate.correctAtMediumOrHard.ok, `${gate.correctAtMediumOrHard.have} of ${gate.correctAtMediumOrHard.need}`],
    ["Estimated mastery", gate.masteryScore.ok, `${pct(gate.masteryScore.have)} (need ${pct(gate.masteryScore.need)})`],
    ["Answers within 1.5× expected time", gate.speed.ok, `${pct(1 - gate.speed.slowShare)} on time (need ${pct(1 - gate.speed.max)})`],
    [
      "Retention check after the revision interval",
      gate.retention.ok,
      gate.retention.passedAt ? `Passed ${gate.retention.passedAt.slice(0, 10)}` : gate.retention.dueAt ? `Due from ${gate.retention.dueAt.slice(0, 10)}` : "After all other gates are met",
    ],
  ];
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.map(([label, ok, detail]) => (
        <li key={label} className="flex items-center justify-between gap-3 py-1.5">
          <span className="flex items-center gap-2">
            <span aria-hidden className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "✓" : "○"}</span>
            {label}
            <span className="sr-only">{ok ? "met" : "not yet met"}</span>
          </span>
          <span className="text-slate-600">{detail}</span>
        </li>
      ))}
    </ul>
  );
}
