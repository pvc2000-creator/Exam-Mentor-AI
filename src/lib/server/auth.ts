/**
 * Authentication: bcrypt password hashes and opaque, random session tokens stored only as SHA-256
 * hashes (the pattern recommended by OWASP and by the Lucia auth guide). Cookies are httpOnly,
 * SameSite=Lax and Secure in production.
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "./db";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "em_session";
const SESSION_DAYS = 30;
const BCRYPT_COST = 12;

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_COST);
}

let dummy: Promise<string> | null = null;
/** Hash compared against when the email does not exist, so response time does not reveal registered emails. */
export function dummyHash() {
  return (dummy ??= bcrypt.hash("not-a-real-password", BCRYPT_COST));
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SECURE_COOKIES === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function userFromToken(token: string | undefined | null) {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, preferredLanguage: true, createdAt: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof userFromToken>>>;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(token);
}

export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Please sign in.");
  if (role && user.role !== role) throw new AuthError(403, "You do not have access to this page.");
  return user;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

/** For server-rendered pages: send signed-out visitors to sign in, and show "not found" for a wrong role. */
export async function requirePageUser(role?: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) notFound();
  return user;
}
