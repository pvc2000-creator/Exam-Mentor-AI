"use client";

import { useActionState } from "react";
import { deleteAccountAction, type DeleteState } from "@/app/actions/account";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="del-password">Your password</label>
        <input id="del-password" name="password" type="password" autoComplete="current-password" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="del-confirm">Type DELETE to confirm</label>
        <input id="del-confirm" name="confirm" className="input" required pattern="DELETE" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-danger" disabled={pending}>{pending ? "Deleting…" : "Permanently delete my account"}</button>
    </form>
  );
}
