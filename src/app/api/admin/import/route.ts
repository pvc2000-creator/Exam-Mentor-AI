import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { prisma } from "@/lib/server/db";
import { getActiveConfig, lookupFromConfig } from "@/lib/server/syllabus";
import { maxUploadBytes, parseUpload } from "@/lib/server/upload";
import { importQuestions } from "@/lib/server/importer";

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("ADMIN");
  if (!rateLimit(`import:${admin.id}`, 20, 60 * 60_000).ok) throw new HttpError(429, "Too many imports. Try again later.");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxUploadBytes() + 64 * 1024) throw new HttpError(413, "File is too large.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  const topicId = String(form.get("topicId") ?? "") || undefined;
  const { config } = await getActiveConfig();
  const lookup = lookupFromConfig(config);
  const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120);
  const { format, parsed } = await parseUpload(name, Buffer.from(await file.arrayBuffer()), (t) => lookup.subjectOfTopic(t), { fallbackTopicId: topicId });
  const report = await importQuestions(parsed, lookup, { fileName: name, format, importedBy: admin.id });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "QUESTIONS_IMPORT", target: report.batchId, detail: { fileName: name, format, created: report.created, duplicates: report.duplicates, invalid: report.invalid } } });
  return NextResponse.json({ format, ...report, items: report.items.slice(0, 200) });
});
