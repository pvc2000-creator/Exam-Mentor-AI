import Link from "next/link";
import { loadConfigFile } from "@/lib/server/syllabus";

export default function Landing() {
  const cfg = loadConfigFile();
  const p = cfg.pattern;
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">MP Police Constable · {cfg.cycle}</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">A mock test that learns how <em className="not-italic text-brand-600">you</em> learn.</h1>
          <p className="mt-4 text-lg text-slate-600">
            ExamMentor AI keeps a private learning profile for every student. It tracks what you know, what you keep getting wrong, where you
            are slow and what you are starting to forget, then builds your next mock around exactly that.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-5 py-3 text-base">Start with a free diagnostic</Link>
            <Link href="/login" className="btn-secondary px-5 py-3 text-base">I already have an account</Link>
          </div>
        </div>
        <div className="card">
          <h2 className="h2 mb-3">Exam pattern used by the simulator</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="muted">Questions</dt><dd className="text-lg font-semibold">{p.totalQuestions} MCQs</dd></div>
            <div><dt className="muted">Duration</dt><dd className="text-lg font-semibold">{p.durationMinutes} minutes</dd></div>
            <div><dt className="muted">Marking</dt><dd className="text-lg font-semibold">+{p.marking.correct} / {p.marking.incorrect === 0 ? "no negative" : p.marking.incorrect}</dd></div>
            <div><dt className="muted">Total marks</dt><dd className="text-lg font-semibold">{p.totalMarks}</dd></div>
          </dl>
          <ul className="mt-4 space-y-1 text-sm">
            {cfg.sections.map((s) => (
              <li key={s.subjectId} className="flex justify-between border-t border-slate-100 pt-1"><span>{s.name}</span><span className="font-medium">{s.questions} Q</span></li>
            ))}
          </ul>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            Configuration {cfg.version}. Figures agree across secondary sources that summarise the official rule book, but have not yet been
            checked against the rule book PDF itself. Always confirm with MPESB.
          </p>
        </div>
      </section>

      <section>
        <h2 className="h1 mb-6 text-center">Why this is different from an ordinary mock test</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Your weak topics keep coming back", "A topic you struggle with stays in your mocks, with new questions and different wording, until you show reliable mastery. One lucky score is not enough."],
            ["Mastery is earned, then checked again", "Mastery needs enough varied questions, high recent accuracy, success on harder questions and a retention check after a gap. Mastered topics return less often, but they do return."],
            ["Mistakes are diagnosed carefully", "Each wrong answer is compared with the question's expected time, your own pace and known misconceptions. Uncertain diagnoses are shown as possible causes, not facts."],
            ["Every recommendation has a reason", "Your plan shows why each activity is recommended and what you need to demonstrate to move on."],
            ["Two students, two different mocks", "Your next mock is generated from your own history. The mentor records exactly how and why each question was chosen."],
            ["Works without paid AI", "The learning engine runs entirely on your own data. An optional AI tutor can add explanations when configured."],
          ].map(([t, d]) => (
            <div key={t} className="card">
              <h3 className="font-semibold text-slate-900">{t}</h3>
              <p className="mt-2 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="h2">What you should know before starting</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>The current question bank is synthetic practice material written for this app. It is not a collection of official previous-year questions, and every question shows its source label.</li>
          <li>No prediction of which topics will appear in the real exam is made. Topic weights inside each section are an assumption until verified previous-year papers are analysed.</li>
          <li>This is a new tool. Its effect on exam results has not been measured yet.</li>
        </ul>
      </section>
    </div>
  );
}
