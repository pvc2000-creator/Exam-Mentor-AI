"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { clientKey, createSession, dummyHash, destroyCurrentSession, hashPassword, setSessionCookie, verifyPassword } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200).regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number"),
  language: z.enum(["EN", "HI"]).default("EN"),
});

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const ip = await clientKey();
  if (!rateLimit(`register:${ip}`, 10, 60 * 60_000).ok) return { error: "Too many sign-up attempts. Please try again later." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const { name, email, password, language } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  // Same message whether or not the account exists would leak nothing, but registration UX needs clarity;
  // we keep it generic to avoid confirming which emails are registered.
  if (exists) return { error: "Could not create an account with these details. If you already have an account, sign in." };
  const user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password), preferredLanguage: language } });
  const s = await createSession(user.id);
  await setSessionCookie(s.token, s.expiresAt);
  redirect("/dashboard?welcome=1");
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const ip = await clientKey();
  const rl = rateLimit(`login:${ip}:${parsed.data.email}`, 8, 15 * 60_000);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minute(s).` };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : await verifyPassword(parsed.data.password, await dummyHash());
  if (!user || !ok) return { error: "Email or password is incorrect." };
  const s = await createSession(user.id);
  await setSessionCookie(s.token, s.expiresAt);
  redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/");
}
