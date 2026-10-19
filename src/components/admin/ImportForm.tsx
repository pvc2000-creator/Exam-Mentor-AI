"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Report {
  format: string; total: number; created: number; duplicates: number; invalid: number; flagged: number; batchId: string;
  items: Array<{ index: number; id?: string; status: string; issues: Array<{ severity: string; code: string; message: string }>; stem: string }>;
  unresolved: Array<{ ref: string; reason: string; text: string }>;
}

export function ImportForm({ topics, maxMb }: { topics: Array<{ id: string; name: string }>; maxMb: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  return (
    <div className="space-y-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = fd.get("file") as File | null;
          if (f && f.size > maxMb * 1024 * 1024) { setErr(`File is larger than ${maxMb} MB.`); return; }
          setBusy(true); setErr(null); setReport(null);
          const res = await fetch("/api/admin/import", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) setErr(data.error ?? "Import failed");
          else { setReport(data); router.refresh(); }
        }}
      >
        <div>
          <label className="label" htmlFor="file">File (.csv, .json or .pdf, up to {maxMb} MB)</label>
          <input id="file" name="file" type="file" accept=".csv,.json,.pdf,text/csv,application/json,application/pdf" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="topicId">Topic for PDF extraction</label>
          <select id="topicId" name="topicId" className="input" defaultValue="">
            <option value="">(not a PDF)</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex items-end"><button className="btn-primary" disabled={busy} type="submit">{busy ? "Importing…" : "Validate and import"}</button></div>
      </form>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {report && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm" data-testid="import-report">
          <p className="font-medium">Import report ({report.format.toUpperCase()})</p>
          <p className="mt-1">{report.total} records · {report.created} added to the review queue · {report.duplicates} duplicates skipped · {report.invalid} invalid · {report.flagged} flagged · {report.unresolved.length} could not be extracted</p>
          {report.items.filter((i) => i.status !== "created" || i.issues.length).length > 0 && (
            <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
              {report.items.filter((i) => i.status !== "created" || i.issues.length).map((i) => (
                <li key={i.index}><strong>#{i.index + 1} {i.status}</strong>: {i.stem.slice(0, 80)} {i.issues.map((x) => `[${x.severity}: ${x.message}]`).join(" ")}</li>
              ))}
            </ul>
          )}
          {report.unresolved.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-slate-600">
              {report.unresolved.map((u, k) => <li key={k}>{u.ref}: {u.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
