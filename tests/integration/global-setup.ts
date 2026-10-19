import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Prepares the dedicated test database once per run: apply migrations, empty every table, then seed.
 * Guarded so it can never run against a database whose name does not contain "test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/exammentor_test?schema=public";
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Refusing to prepare database "${dbName}": its name must contain "test".`);
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const db = new PrismaClient({ datasourceUrl: url });
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await db.$disconnect();
  execSync("npx tsx scripts/seed.ts", { env, stdio: "pipe" });
}
