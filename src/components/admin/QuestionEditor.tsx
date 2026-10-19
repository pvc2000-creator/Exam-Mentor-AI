"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface EditableQuestion {
  id: string; stem: string; stemHi: string | null; options: Array<{ key: string; text: string }>; correctOption: string;
  explanation: string | null; difficulty: string; topicId: string;
}

export function QuestionEditor({ q, topics }: { q: EditableQuestion; topics: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  async function send(body: unknown) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/admin/questions/${q.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setErr(data.error ?? "Failed");
    else { setOpen(false); router.refresh(); }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => send({ action: "approve" })} data-testid={`approve-${q.id}`}>Approve</button>
        <input aria-label="Reason for rejecting" className="input w-56 py-1 text-xs" placeholder="Reason for rejecting" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
        <button type="button" className="btn-danger px-3 py-1 text-xs" disabled={busy || rejectNote.trim().length < 3} onClick={() => send({ action: "reject", note: rejectNote })}>Reject</button>
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setOpen((x) => !x)}>{open ? "Close editor" : "Edit"}</button>
        {err && <span role="alert" className="text-xs text-red-600">{err}</span>}
      </div>
      {open && (
        <form
          className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            send({
              action: "edit",
              stem: String(fd.get("stem")), stemHi: String(fd.get("stemHi") ?? ""),
              options: q.options.map((o) => String(fd.get(`opt-${o.key}`))),
              correctOption: String(fd.get("correct")), explanation: String(fd.get("explanation") ?? ""),
              difficulty: String(fd.get("difficulty")), topicId: String(fd.get("topicId")), note: String(fd.get("note") ?? "") || undefined,
            });
          }}
        >
          <label className="label" htmlFor={`stem-${q.id}`}>Question</label>
          <textarea id={`stem-${q.id}`} name="stem" className="input" defaultValue={q.stem} rows={3} required />
          <label className="label" htmlFor={`stemHi-${q.id}`}>Question (Hindi)</label>
          <textarea id={`stemHi-${q.id}`} name="stemHi" className="input" defaultValue={q.stemHi ?? ""} rows={2} />
          {q.options.map((o) => (
            <div key={o.key} className="flex items-center gap-2">
              <span className="w-5 font-medium">{o.key}</span>
              <input aria-label={`Option ${o.key}`} name={`opt-${o.key}`} className="input" defaultValue={o.text} required />
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-3">
            <div><label className="label" htmlFor={`correct-${q.id}`}>Correct option</label><select id={`correct-${q.id}`} name="correct" className="input" defaultValue={q.correctOption}>{q.options.map((o) => <option key={o.key}>{o.key}</option>)}</select></div>
            <div><label className="label" htmlFor={`diff-${q.id}`}>Difficulty</label><select id={`diff-${q.id}`} name="difficulty" className="input" defaultValue={q.difficulty}><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></div>
            <div><label className="label" htmlFor={`topic-${q.id}`}>Topic</label><select id={`topic-${q.id}`} name="topicId" className="input" defaultValue={q.topicId}>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          </div>
          <label className="label" htmlFor={`exp-${q.id}`}>Explanation</label>
          <textarea id={`exp-${q.id}`} name="explanation" className="input" defaultValue={q.explanation ?? ""} rows={3} />
          <label className="label" htmlFor={`note-${q.id}`}>Review note</label>
          <input id={`note-${q.id}`} name="note" className="input" />
          <p className="text-xs text-slate-500">Saving an edit returns the question to the review queue; approve it separately.</p>
          <button className="btn-primary w-fit" disabled={busy} type="submit">Save edit</button>
        </form>
      )}
    </div>
  );
}
