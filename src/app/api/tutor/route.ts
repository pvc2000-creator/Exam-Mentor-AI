import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { explainQuestion } from "@/lib/server/tutor";

const schema = z.object({
  questionId: z.string().min(1).max(64),
  selectedOption: z.string().regex(/^[A-F]$/).nullable().optional(),
  language: z.enum(["EN", "HI"]).default("EN"),
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const rl = rateLimit(`tutor:${user.id}`, 20, 10 * 60_000);
  if (!rl.ok) throw new HttpError(429, `Too many tutor requests. Try again in ${rl.retryAfterSec} s.`);
  const body = schema.parse(await req.json());
  return NextResponse.json(await explainQuestion(user.id, body.questionId, body.selectedOption ?? null, body.language));
});
