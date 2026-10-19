/** Test helpers: users with real sessions, and a cookie jar shared with the mocked `next/headers` (see setup.ts). */
const g = globalThis as unknown as { __cookieJar?: Map<string, string> };
export const jar = (g.__cookieJar ??= new Map<string, string>());

import { prisma } from "@/lib/server/db";
import { createSession, hashPassword, SESSION_COOKIE } from "@/lib/server/auth";

let n = 0;
export async function makeUser(role: "STUDENT" | "ADMIN" = "STUDENT") {
  const user = await prisma.user.create({ data: { email: `test-${Date.now()}-${n++}@example.invalid`, name: `Test ${role.toLowerCase()} ${n}`, role, passwordHash: await hashPassword("correct-horse-42") } });
  const { token } = await createSession(user.id);
  return { user, token };
}

export function signInAs(token: string | null) {
  jar.clear();
  if (token) jar.set(SESSION_COOKIE, token);
}

export function req(method: string, body?: unknown) {
  return new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });

export async function json(res: Response) {
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
