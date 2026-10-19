import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route handler: maps known errors to safe JSON messages and never leaks stack traces. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError || e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", details: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
      console.error("[api] unexpected error:", e instanceof Error ? e.message : "unknown");
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
