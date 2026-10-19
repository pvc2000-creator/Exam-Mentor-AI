import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { setPaperVerified } from "@/lib/server/admin";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { id } = await ctx.params;
  const { isVerified } = z.object({ isVerified: z.boolean() }).parse(await req.json());
  await setPaperVerified(admin.id, id, isVerified);
  return NextResponse.json({ ok: true });
});
