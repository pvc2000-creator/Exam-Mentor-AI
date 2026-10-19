import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_DB } from "../../playwright.config";

/** Empties and seeds the e2e database and creates a test-only admin account. Refuses non-test databases. */
export default async function setup() {
  const dbName = new URL(E2E_DB).pathname.slice(1);
  if (!/e2e|test/i.test(dbName)) throw new Error(`Refusing to prepare database "${dbName}".`);
  const env = { ...process.env, DATABASE_URL: E2E_DB };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await db.$disconnect();
  execSync("npx tsx scripts/seed.ts", { env, stdio: "pipe" });
  execSync("npx tsx scripts/create-admin.ts", { env: { ...env, ADMIN_EMAIL: "admin@example.invalid", ADMIN_PASSWORD: "e2e-admin-password-1", ADMIN_NAME: "Test Admin" }, stdio: "pipe" });
}
