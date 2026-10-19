"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface StartMockOptions {
  type: string;
  subjectId?: string;
  topicId?: string;
  questionCount?: number;
  durationMinutes?: number;
  feedbackMode?: "IMMEDIATE" | "END_OF_SET";
}

export async function startMock(opts: StartMockOptions): Promise<string> {
  const res = await fetch("/api/mocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not create the test.");
  return body.attemptId as string;
}

export function StartMockButton({ label, className, diagnosticIfNew, ...opts }: StartMockOptions & { label: string; className?: string; diagnosticIfNew?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={className ?? "btn-primary"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const id = await startMock(diagnosticIfNew ? { ...opts, type: "DIAGNOSTIC" } : opts);
            router.push(`/attempt/${id}`);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Building your test…" : label}
      </button>
      {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
