/**
 * Replaces `next/headers` with an in-memory cookie jar so the real route handlers, including their
 * authentication and authorisation checks, can be called directly with a Request.
 */
import { vi } from "vitest";

vi.mock("next/headers", () => {
  const g = globalThis as unknown as { __cookieJar?: Map<string, string> };
  const jar = (g.__cookieJar ??= new Map<string, string>());
  return {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
      delete: (name: string) => void jar.delete(name),
    }),
    headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
  };
});
