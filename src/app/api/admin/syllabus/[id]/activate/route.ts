import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { activateSyllabusVersion } from "@/lib/server/admin";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { id } = await ctx.params;
  await activateSyllabusVersion(admin.id, id);
  return NextResponse.json({ ok: true });
});
