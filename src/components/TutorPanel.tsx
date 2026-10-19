"use client";

import { useState } from "react";

interface TutorResult {
  provider: "offline" | "anthropic";
  fallbackReason?: string;
  correctOption: string;
  explanation: string;
  whyYourAnswer: string | null;
  conceptNote: string | null;
  practice: null | { stem: string; options: Array<{ key: string; text: string }>; correctOption: string; solution: string; note: string };
}

export function TutorPanel({ questionId, selectedOption }: { questionId: string; selectedOption: string | null }) {
  const [data, setData] = useState<TutorResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"EN" | "HI">("EN");
  const [pick, setPick] = useState<string | null>(null);

  async function ask(language: "EN" | "HI") {
    setBusy(true);
    setErr(null);
    setLang(language);
    setPick(null);
    try {
      const res = await fetch("/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, selectedOption, language }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The tutor is unavailable.");
      setData(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => ask("EN")} data-testid="tutor-explain">
          {busy ? "Explaining…" : "Explain this"}
        </button>
        <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => ask("HI")}>
          हिंदी में समझाएँ
        </button>
        {err && <span className="text-xs text-red-700">{err}</span>}
      </div>
    );

  return (
    <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm" data-testid="tutor-panel">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          {data.provider === "anthropic" ? "AI tutor (checked against the verified answer)" : "Offline tutor (from reviewed explanations)"}
          {data.fallbackReason ? ` · ${data.fallbackReason}` : ""}
        </span>
        <button type="button" className="underline" onClick={() => ask(lang === "EN" ? "HI" : "EN")} disabled={busy}>
          {lang === "EN" ? "हिंदी" : "English"}
        </button>
      </div>
      <p className="whitespace-pre-line">{data.explanation}</p>
      {data.whyYourAnswer && <p className="mt-2 text-slate-700"><strong>Your answer:</strong> {data.whyYourAnswer}</p>}
      {data.conceptNote && <p className="mt-2 text-slate-700"><strong>Concept:</strong> {data.conceptNote}</p>}
      {data.practice && (
        <div className="mt-3 rounded-md bg-white p-3">
          <p className="font-medium">Try a similar one</p>
          <p className="mt-1">{data.practice.stem}</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {data.practice.options.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setPick(o.key)}
                className={`rounded border px-2 py-1 text-left ${pick === o.key ? (o.key === data.practice!.correctOption ? "border-emerald-500 bg-emerald-50" : "border-red-400 bg-red-50") : "border-slate-200"}`}
              >
                {o.key}. {o.text}
              </button>
            ))}
          </div>
          {pick && (
            <p className="mt-2 text-slate-700">
              {pick === data.practice.correctOption ? "Correct. " : `Not quite; the answer is ${data.practice.correctOption}. `}
              {data.practice.solution}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">{data.practice.note}</p>
        </div>
      )}
    </div>
  );
}
