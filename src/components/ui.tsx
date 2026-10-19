import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ title, children, className, action, subtitle }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={clsx("card", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="h2">{title}</h2>}
            {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-100 text-brand-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  purple: "bg-violet-100 text-violet-800",
} as const;

export function Badge({ children, tone = "gray", title }: { children: ReactNode; tone?: keyof typeof TONES; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Progress({ value, tone = "blue", label }: { value: number; tone?: "blue" | "green" | "amber" | "red"; label?: string }) {
  const color = { blue: "bg-brand-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx("h-2 rounded-full", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="muted mt-2">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
