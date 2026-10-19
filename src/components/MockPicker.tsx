"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startMock, type StartMockOptions } from "./StartMockButton";

type MockType = StartMockOptions["type"];
interface Subject { id: string; name: string; topics: Array<{ id: string; name: string }> }

const TYPES: Array<{ type: MockType; label: string; help: string; count: number }> = [
  { type: "ADAPTIVE_WEAKNESS", label: "Personalised weakness mock", help: "Built from your learning profile: weak topics, repeated errors, speed issues, and spaced revision.", count: 30 },
  { type: "FULL_LENGTH", label: "Full-length simulation", help: "Exam pattern from the active configuration: 100 questions in 120 minutes, sections in order.", count: 100 },
  { type: "SUBJECT", label: "Subject mock", help: "One section of the paper, weighted by topic.", count: 25 },
  { type: "TOPIC_PRACTICE", label: "Topic practice", help: "Questions on one topic. Best with instant feedback.", count: 10 },
  { type: "SPEED_DRILL", label: "Speed and accuracy drill", help: "Less time per question than the exam, focused on topics where you are slow or rushed.", count: 15 },
  { type: "REVISION", label: "Revision mock", help: "Topics you have learned, due for spaced revision or a retention check.", count: 20 },
  { type: "MIXED", label: "Mixed-syllabus mock", help: "A cross-section of the whole syllabus.", count: 30 },
  { type: "DIAGNOSTIC", label: "Diagnostic baseline", help: "Covers every topic in proportion to the syllabus. Use it at the start, or to re-baseline.", count: 30 },
];

export function MockPicker({ subjects, initialType = "ADAPTIVE_WEAKNESS", initialTopic, initialFeedback = "END_OF_SET", only }: { subjects: Subject[]; initialType?: MockType; initialTopic?: string; initialFeedback?: "IMMEDIATE" | "END_OF_SET"; only?: MockType[] }) {
  const router = useRouter();
  const types = only ? TYPES.filter((t) => only.includes(t.type)) : TYPES;
  const [type, setType] = useState<MockType>(initialType);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(initialTopic ?? subjects[0]?.topics[0]?.id ?? "");
  const [count, setCount] = useState<number>(types.find((t) => t.type === initialType)?.count ?? 20);
  const [feedbackMode, setFeedback] = useState<"IMMEDIATE" | "END_OF_SET">(initialFeedback);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const def = TYPES.find((t) => t.type === type)!;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const id = await startMock({
            type,
            subjectId: type === "SUBJECT" ? subjectId : undefined,
            topicId: type === "TOPIC_PRACTICE" ? topicId : undefined,
            questionCount: type === "FULL_LENGTH" ? undefined : count,
            feedbackMode: type === "FULL_LENGTH" ? "END_OF_SET" : feedbackMode,
          });
          router.push(`/attempt/${id}`);
        } catch (e2) {
          setErr((e2 as Error).message);
          setBusy(false);
        }
      }}
    >
      {types.length > 1 && (
        <fieldset>
          <legend className="label">Type of test</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {types.map((t) => (
              <label key={t.type} className={`cursor-pointer rounded-lg border p-3 text-sm ${type === t.type ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}>
                <input type="radio" name="type" className="sr-only" value={t.type} checked={type === t.type} onChange={() => { setType(t.type); setCount(t.count); }} />
                <span className="font-medium">{t.label}</span>
                <span className="mt-0.5 block text-slate-600">{t.help}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {types.length === 1 && <p className="muted">{def.help}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        {type === "SUBJECT" && (
          <div>
            <label className="label" htmlFor="subject">Subject</label>
            <select id="subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {type === "TOPIC_PRACTICE" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="topic">Topic</label>
            <select id="topic" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {subjects.map((s) => (
                <optgroup key={s.id} label={s.name}>
                  {s.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {type !== "FULL_LENGTH" && (
          <div>
            <label className="label" htmlFor="count">Questions</label>
            <input id="count" type="number" className="input" min={5} max={60} value={count} onChange={(e) => setCount(Math.max(5, Math.min(60, Number(e.target.value) || 5)))} />
          </div>
        )}
        {type !== "FULL_LENGTH" && (
          <div>
            <label className="label" htmlFor="feedback">Feedback</label>
            <select id="feedback" className="input" value={feedbackMode} onChange={(e) => setFeedback(e.target.value as "IMMEDIATE" | "END_OF_SET")}>
              <option value="IMMEDIATE">After each question</option>
              <option value="END_OF_SET">At the end</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy} data-testid="start-test">{busy ? "Building your test…" : `Start ${def.label.toLowerCase()}`}</button>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      </div>
    </form>
  );
}
