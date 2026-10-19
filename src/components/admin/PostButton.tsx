"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Posts a JSON body to an admin endpoint and refreshes the page on success. */
export function PostButton({ url, body, label, className, confirm }: { url: string; body?: unknown; label: string; className?: string; confirm?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  async function go() {
    setBusy(true);
    setErr(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setAsking(false);
    if (!res.ok) setErr(data.error ?? "Failed");
    else router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      {asking ? (
        <>
          <span className="text-xs">{confirm}</span>
          <button type="button" className="btn-danger px-2 py-1 text-xs" disabled={busy} onClick={go}>Yes</button>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setAsking(false)}>No</button>
        </>
      ) : (
        <button type="button" className={className ?? "btn-secondary px-2 py-1 text-xs"} disabled={busy} onClick={() => (confirm ? setAsking(true) : go())}>{busy ? "…" : label}</button>
      )}
      {err && <span role="alert" className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
