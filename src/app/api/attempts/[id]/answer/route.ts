import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { saveAnswer } from "@/lib/server/mocks";
import { rateLimit } from "@/lib/server/rate-limit";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!rateLimit(`answer:${user.id}`, 600, 60_000).ok) throw new HttpError(429, "Too many requests.");
  return NextResponse.json(await saveAnswer(user.id, id, await req.json()));
});
