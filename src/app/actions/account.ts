"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { destroyCurrentSession, requireUser, verifyPassword } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { deleteAccount } from "@/lib/server/account";

export type DeleteState = { error?: string } | undefined;

const schema = z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE", { errorMap: () => ({ message: "Type DELETE to confirm." }) }) });

export async function deleteAccountAction(_: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await requireUser();
  if (!rateLimit(`delete:${user.id}`, 5, 15 * 60_000).ok) return { error: "Too many attempts. Try again later." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(parsed.data.password, row.passwordHash))) return { error: "Password is incorrect." };
  await destroyCurrentSession();
  await deleteAccount(user.id);
  redirect("/?deleted=1");
}
