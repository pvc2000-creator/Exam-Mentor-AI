"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyllabusUpload() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setMsg(null);
        const res = await fetch("/api/admin/syllabus", { method: "POST", body: new FormData(e.currentTarget) });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) setMsg(`${data.error ?? "Upload failed"}${data.details ? `: ${data.details.join("; ")}` : ""}`);
        else { setMsg(`Installed version ${data.version}${data.activated ? " and activated it" : " (inactive)"}.`); router.refresh(); }
      }}
    >
      <div>
        <label className="label" htmlFor="cfg">Configuration JSON</label>
        <input id="cfg" name="file" type="file" accept=".json,application/json" className="input" required />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activate" /> Activate after upload</label>
      <button className="btn-primary" disabled={busy} type="submit">{busy ? "Validating…" : "Validate and install"}</button>
      {msg && <p role="status" className="w-full text-sm">{msg}</p>}
    </form>
  );
}
