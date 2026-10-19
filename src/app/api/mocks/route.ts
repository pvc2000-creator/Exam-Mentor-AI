import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { createMock, createMockSchema, startAttempt, expireOverdue } from "@/lib/server/mocks";
import { rateLimit } from "@/lib/server/rate-limit";
import { prisma } from "@/lib/server/db";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!rateLimit(`mock:${user.id}`, 20, 10 * 60_000).ok) throw new HttpError(429, "You are creating tests too quickly. Please wait a few minutes.");
  const input = createMockSchema.parse(await req.json());
  await expireOverdue(user.id);
  const open = await prisma.attempt.findFirst({ where: { userId: user.id, status: "IN_PROGRESS" }, select: { id: true } });
  if (open) throw new HttpError(409, "Finish or submit your current test before starting another one.");
  const mock = await createMock(user.id, input);
  const attempt = await startAttempt(user.id, mock.id);
  return NextResponse.json({ mockId: mock.id, attemptId: attempt.id });
});
