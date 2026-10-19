"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type FormState } from "@/app/actions/auth";

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <div>
        <label className="label" htmlFor="name">Full name</label>
        <input className="input" id="name" name="name" autoComplete="name" required />
        <FieldError msg={state?.fieldErrors?.name} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        <FieldError msg={state?.fieldErrors?.email} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pw-help" />
        <p id="pw-help" className="mt-1 text-xs text-slate-500">At least 10 characters with a letter and a number.</p>
        <FieldError msg={state?.fieldErrors?.password} />
      </div>
      <div>
        <label className="label" htmlFor="language">Preferred question language</label>
        <select className="input" id="language" name="language" defaultValue="EN">
          <option value="EN">English</option>
          <option value="HI">हिन्दी (Hindi)</option>
        </select>
      </div>
      <button className="btn-primary w-full" disabled={pending} type="submit">{pending ? "Creating account…" : "Create account"}</button>
      <p className="muted text-center">Already registered? <Link className="text-brand-600 underline" href="/login">Sign in</Link></p>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn-primary w-full" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="muted text-center">New here? <Link className="text-brand-600 underline" href="/register">Create an account</Link></p>
    </form>
  );
}
