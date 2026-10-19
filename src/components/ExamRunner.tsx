"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RunnerQuestion {
  mtqId: string;
  position: number;
  subject: string;
  topic: string;
  stem: string;
  stemHi: string | null;
  options: Array<{ key: string; text: string; textHi?: string }>;
  sourceLabel: string;
  sourceTone: string;
  selectedOption: string | null;
  markedForReview: boolean;
  timeSpentMs: number;
  visited: boolean;
  feedbackShown: boolean;
  selfConfidence: number | null;
}

interface Feedback {
  correctOption: string;
  isCorrect: boolean;
  explanation: string | null;
  explanationHi: string | null;
  options: Array<{ key: string; text: string; rationale?: string }>;
}

interface Props {
  attemptId: string;
  title: string;
  deadline: string;
  serverNow: string;
  feedbackMode: "IMMEDIATE" | "END_OF_SET";
  questions: RunnerQuestion[];
  defaultLanguage: "EN" | "HI";
  marking: { correct: number; incorrect: number; unanswered: number };
}

type SaveState = "idle" | "saving" | "saved" | "retrying";

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ExamRunner(props: Props) {
  const router = useRouter();
  const storageKey = `em-pending-${props.attemptId}`;
  const [qs, setQs] = useState(props.questions);
  const [idx, setIdx] = useState(() => Math.max(0, props.questions.findIndex((q) => !q.selectedOption)));
  const [lang, setLang] = useState<"EN" | "HI">(props.defaultLanguage);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [error, setError] = useState<string | null>(null);
  const offset = useMemo(() => new Date(props.serverNow).getTime() - Date.now(), [props.serverNow]);
  const deadline = new Date(props.deadline).getTime();
  const [remaining, setRemaining] = useState(deadline - (Date.now() + offset));
  const enteredAt = useRef<number>(Date.now());
  const pending = useRef<Map<string, Record<string, unknown>>>(new Map());
  const flushing = useRef(false);
  const submitted = useRef(false);

  const q = qs[idx];

  // --- persistence: every change is queued, written to localStorage, and flushed with retries ---
  const persistQueue = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...pending.current.values()]));
    } catch {
      /* storage unavailable: the in-memory queue still retries */
    }
  }, [storageKey]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return false;
    flushing.current = true;
    try {
      let attempt = 0;
      while (pending.current.size) {
        const [key, body] = pending.current.entries().next().value as [string, Record<string, unknown>];
        setSaveState(attempt ? "retrying" : "saving");
        try {
          const res = await fetch(`/api/attempts/${props.attemptId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (res.status === 409) {
            const b = await res.json().catch(() => ({}));
            pending.current.clear();
            persistQueue();
            setError(b.error ?? "This test has ended.");
            submitted.current = true;
            router.replace(`/results/${props.attemptId}`);
            return false;
          }
          if (!res.ok && res.status >= 500) throw new Error("server");
          if (pending.current.get(key) === body) pending.current.delete(key);
          persistQueue();
          attempt = 0;
        } catch {
          attempt++;
          await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
          if (attempt > 6) return false;
        }
      }
      setSaveState("saved");
      return true;
    } finally {
      flushing.current = false;
    }
  }, [persistQueue, props.attemptId, router]);

  const enqueue = useCallback(
    (mtqId: string, patch: Record<string, unknown>) => {
      const prev = pending.current.get(mtqId) ?? { mockTestQuestionId: mtqId };
      pending.current.set(mtqId, { ...prev, ...patch });
      persistQueue();
      void flush();
    },
    [flush, persistQueue],
  );

  // Restore unsent changes from an interrupted session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        for (const b of JSON.parse(raw) as Array<Record<string, unknown>>) pending.current.set(String(b.mockTestQuestionId), b);
        void flush();
      }
    } catch {
      /* ignore */
    }
  }, [flush, storageKey]);

  // Time accounting: add the time spent on the current question when leaving it.
  const commitTime = useCallback(
    (visit = false) => {
      const now = Date.now();
      const delta = now - enteredAt.current;
      enteredAt.current = now;
      let total = 0;
      setQs((list) =>
        list.map((x, i) => {
          if (i !== idx) return x;
          total = x.timeSpentMs + delta;
          return { ...x, timeSpentMs: total, visited: true };
        }),
      );
      return { total: (qs[idx]?.timeSpentMs ?? 0) + delta, visit };
    },
    [idx, qs],
  );

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= qs.length || to === idx) return;
      const { total } = commitTime();
      enqueue(qs[idx].mtqId, { timeSpentMs: total, visit: true });
      setIdx(to);
    },
    [commitTime, enqueue, idx, qs],
  );

  const select = (key: string) => {
    if (q.feedbackShown || feedback[q.mtqId]) return;
    const { total } = commitTime();
    const next = q.selectedOption === key ? null : key;
    setQs((list) => list.map((x, i) => (i === idx ? { ...x, selectedOption: next, timeSpentMs: total } : x)));
    enqueue(q.mtqId, { selectedOption: next, timeSpentMs: total });
  };

  const toggleMark = () => {
    setQs((list) => list.map((x, i) => (i === idx ? { ...x, markedForReview: !x.markedForReview } : x)));
    enqueue(q.mtqId, { markedForReview: !q.markedForReview, timeSpentMs: q.timeSpentMs + (Date.now() - enteredAt.current) });
  };

  const setConfidence = (c: number) => {
    setQs((list) => list.map((x, i) => (i === idx ? { ...x, selfConfidence: x.selfConfidence === c ? null : c } : x)));
    enqueue(q.mtqId, { selfConfidence: q.selfConfidence === c ? null : c, timeSpentMs: q.timeSpentMs + (Date.now() - enteredAt.current) });
  };

  const checkAnswer = async () => {
    const { total } = commitTime();
    enqueue(q.mtqId, { timeSpentMs: total });
    await flush();
    const res = await fetch(`/api/attempts/${props.attemptId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockTestQuestionId: q.mtqId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Could not load feedback.");
    setFeedback((f) => ({ ...f, [q.mtqId]: body }));
    setQs((list) => list.map((x, i) => (i === idx ? { ...x, feedbackShown: true } : x)));
  };

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      const { total } = commitTime();
      enqueue(qs[idx].mtqId, { timeSpentMs: total });
      await flush();
      const res = await fetch(`/api/attempts/${props.attemptId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto }) });
      if (!res.ok && res.status !== 409) {
        submitted.current = false;
        setSubmitting(false);
        setError("Submission failed. Your answers are saved; please try again.");
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      router.replace(`/results/${props.attemptId}`);
    },
    [commitTime, enqueue, flush, idx, props.attemptId, qs, router, storageKey],
  );

  // Countdown and automatic submission.
  useEffect(() => {
    const t = setInterval(() => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) void submit(true);
    }, 500);
    return () => clearInterval(t);
  }, [deadline, offset, submit]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase();
      const map: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, A: 0, B: 1, C: 2, D: 3 };
      if (k in map && q.options[map[k]]) select(q.options[map[k]].key);
      else if (k === "N" || e.key === "ArrowRight") go(idx + 1);
      else if (k === "P" || e.key === "ArrowLeft") go(idx - 1);
      else if (k === "M") toggleMark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const answered = qs.filter((x) => x.selectedOption).length;
  const marked = qs.filter((x) => x.markedForReview).length;
  const unanswered = qs.length - answered;
  const fb = feedback[q.mtqId];
  const low = remaining < 5 * 60_000;
  const text = (en: string, hi?: string | null) => (lang === "HI" && hi ? hi : en);

  return (
    <div className="-mx-4 -my-8 min-h-[80vh] bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h1 className="font-semibold">{props.title}</h1>
            <p className="text-xs text-slate-500">
              {answered}/{qs.length} answered · marking +{props.marking.correct}
              {props.marking.incorrect ? ` / ${props.marking.incorrect}` : ", no negative marking"} ·{" "}
              <span aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "retrying" ? "Connection problem, retrying…" : saveState === "saved" ? "All answers saved" : ""}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div role="group" aria-label="Question language" className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
              {(["EN", "HI"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("px-2.5 py-1.5", lang === l ? "bg-slate-800 text-white" : "bg-white")}>
                  {l === "EN" ? "English" : "हिन्दी"}
                </button>
              ))}
            </div>
            <div className={clsx("rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums", low ? "bg-red-100 text-red-700" : "bg-slate-100")} aria-label="Time remaining" role="timer">
              {fmtClock(remaining)}
            </div>
            <button className="btn-primary" type="button" onClick={() => setConfirming(true)} disabled={submitting}>
              Submit
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <article className="card" aria-labelledby="q-stem">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Question {q.position} of {qs.length}</span>
              <span>·</span>
              <span>{q.subject}</span>
              <span>·</span>
              <span>{q.topic}</span>
              <span className={clsx("ml-auto rounded-full px-2 py-0.5", q.sourceTone === "amber" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{q.sourceLabel}</span>
            </div>
            <p id="q-stem" className="whitespace-pre-line text-lg leading-relaxed">{text(q.stem, q.stemHi)}</p>
            {lang === "HI" && !q.stemHi && <p className="mt-1 text-xs text-amber-700">Hindi text is not available for this question yet.</p>}
            <fieldset className="mt-5 space-y-2" disabled={!!fb || q.feedbackShown}>
              <legend className="sr-only">Options</legend>
              {q.options.map((o) => {
                const chosen = q.selectedOption === o.key;
                const isRight = fb && fb.correctOption === o.key;
                const isWrong = fb && chosen && !fb.isCorrect;
                return (
                  <label key={o.key} className={clsx("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition", chosen ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50", isRight && "border-emerald-500 bg-emerald-50", isWrong && "border-red-500 bg-red-50")}>
                    <input type="radio" name={`q-${q.mtqId}`} className="mt-1" checked={chosen} onChange={() => select(o.key)} onClick={() => chosen && select(o.key)} />
                    <span><span className="font-semibold">{o.key}.</span> {text(o.text, o.textHi)}</span>
                  </label>
                );
              })}
            </fieldset>

            {fb && (
              <div className={clsx("mt-4 rounded-lg p-4 text-sm", fb.isCorrect ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900")} aria-live="polite">
                <p className="font-semibold">{fb.isCorrect ? "Correct." : `Not quite. The answer is ${fb.correctOption}.`}</p>
                <p className="mt-1">{text(fb.explanation ?? "", fb.explanationHi)}</p>
                {!fb.isCorrect && fb.options.find((o) => o.key === q.selectedOption)?.rationale && <p className="mt-1">Your choice: {fb.options.find((o) => o.key === q.selectedOption)?.rationale}</p>}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500">How sure are you? (optional)</span>
              {[[3, "Sure"], [2, "Unsure"], [1, "Guessing"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setConfidence(v as number)} aria-pressed={q.selfConfidence === v} className={clsx("rounded-full border px-2.5 py-0.5 text-xs", q.selfConfidence === v ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300")}>
                  {l}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => go(idx - 1)} disabled={idx === 0}>← Previous</button>
              <button type="button" className={clsx("btn-secondary", q.markedForReview && "border-violet-400 bg-violet-50")} onClick={toggleMark} aria-pressed={q.markedForReview}>
                {q.markedForReview ? "Marked for review" : "Mark for review"}
              </button>
              {props.feedbackMode === "IMMEDIATE" && !fb && !q.feedbackShown && (
                <button type="button" className="btn-secondary" onClick={checkAnswer} disabled={!q.selectedOption}>Check answer</button>
              )}
              <button type="button" className="btn-primary ml-auto" onClick={() => (idx === qs.length - 1 ? setConfirming(true) : go(idx + 1))}>
                {idx === qs.length - 1 ? "Finish" : "Save & next →"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">Shortcuts: A–D or 1–4 to answer, N / P to move, M to mark.</p>
          </article>

          <aside className="card h-fit" aria-label="Question navigator">
            <h2 className="mb-3 text-sm font-semibold">Questions</h2>
            <div className="grid grid-cols-8 gap-1.5 lg:grid-cols-6">
              {qs.map((x, i) => (
                <button
                  key={x.mtqId}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Question ${x.position}${x.selectedOption ? ", answered" : ", not answered"}${x.markedForReview ? ", marked for review" : ""}`}
                  aria-current={i === idx}
                  className={clsx(
                    "relative h-8 rounded text-xs font-semibold",
                    x.selectedOption ? "bg-emerald-500 text-white" : x.visited ? "border-2 border-red-400 bg-white text-red-700" : "bg-slate-100 text-slate-600",
                    i === idx && "ring-2 ring-brand-600 ring-offset-1",
                  )}
                >
                  {x.position}
                  {x.markedForReview && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden />}
                </button>
              ))}
            </div>
            <ul className="mt-4 space-y-1 text-xs text-slate-600">
              <li><span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-500 align-middle" />Answered ({answered})</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded border-2 border-red-400 align-middle" />Seen, not answered</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded bg-slate-100 align-middle" />Not visited</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-violet-500 align-middle" />Marked for review ({marked})</li>
            </ul>
          </aside>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="card w-full max-w-md">
            <h2 id="confirm-title" className="h2">Submit this test?</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Answered: <strong>{answered}</strong></li>
              <li className={unanswered ? "text-red-700" : ""}>Unanswered: <strong>{unanswered}</strong></li>
              <li>Marked for review: <strong>{marked}</strong></li>
              <li>Time left: <strong>{fmtClock(remaining)}</strong></li>
            </ul>
            {unanswered > 0 && props.marking.incorrect === 0 && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">There is no negative marking in this exam pattern, so an unanswered question can only cost you marks.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} autoFocus>Keep working</button>
              <button type="button" className="btn-primary" onClick={() => submit(false)} disabled={submitting}>{submitting ? "Submitting…" : "Submit now"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
