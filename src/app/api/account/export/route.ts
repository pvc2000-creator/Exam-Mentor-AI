import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { exportAccount } from "@/lib/server/account";

export const GET = handle(async () => {
  const user = await requireUser();
  if (!rateLimit(`export:${user.id}`, 5, 60 * 60_000).ok) throw new HttpError(429, "Too many exports. Try again later.");
  const data = await exportAccount(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="exammentor-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
