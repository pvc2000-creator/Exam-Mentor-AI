import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { reviewQuestion, reviewSchema } from "@/lib/server/admin";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { id } = await ctx.params;
  return NextResponse.json(await reviewQuestion(admin.id, id, reviewSchema.parse(await req.json())));
});
