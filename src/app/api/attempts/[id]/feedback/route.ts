import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { revealFeedback } from "@/lib/server/mocks";

const schema = z.object({ mockTestQuestionId: z.string().min(1).max(64) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { mockTestQuestionId } = schema.parse(await req.json());
  return NextResponse.json(await revealFeedback(user.id, id, mockTestQuestionId));
});
