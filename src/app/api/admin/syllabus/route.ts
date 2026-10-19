import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle, HttpError } from "@/lib/server/http";
import { prisma } from "@/lib/server/db";
import { installExamConfig } from "@/lib/server/syllabus";
import { parseExamConfig } from "@/lib/exam-config";

/** Upload a new syllabus/exam configuration version. It is stored inactive unless `activate` is set. */
export const POST = handle(async (req: Request) => {
  const admin = await requireUser("ADMIN");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a JSON configuration file.");
  if (file.size > 1024 * 1024) throw new HttpError(413, "Configuration files must be under 1 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new HttpError(400, "The file is not valid JSON.");
  }
  const cfg = parseExamConfig(raw);
  const existing = await prisma.syllabusVersion.findFirst({ where: { version: cfg.version, exam: { code: cfg.examCode } } });
  if (existing) throw new HttpError(409, `Version ${cfg.version} already exists. Give the new configuration a new version.`);
  const activate = form.get("activate") === "on";
  await installExamConfig(cfg, { activate });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "SYLLABUS_UPLOAD", target: cfg.version, detail: { activate } } });
  return NextResponse.json({ version: cfg.version, activated: activate });
});
