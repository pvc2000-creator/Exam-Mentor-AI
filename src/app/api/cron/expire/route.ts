import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handle, HttpError } from "@/lib/server/http";
import { expireOverdue } from "@/lib/server/mocks";

/** Auto-submits attempts whose time ran out while the student was away. Call from a scheduler with CRON_SECRET. */
export const POST = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw new HttpError(401, "Unauthorized");
  return NextResponse.json({ submitted: await expireOverdue() });
});
