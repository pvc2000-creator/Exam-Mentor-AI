import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { submitAttempt } from "@/lib/server/mocks";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await submitAttempt(user.id, id, { auto: body?.auto === true }));
});
