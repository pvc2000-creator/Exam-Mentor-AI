/**
 * Creates an administrator account. Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD or are
 * prompted for; nothing is hard-coded and the password is never printed.
 *   npm run admin:create
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=... npm run admin:create
 *   npm run admin:create -- --promote existing@example.com   (make an existing account admin)
 */
import readline from "node:readline";
import { prisma } from "../src/lib/server/db";
import { hashPassword } from "../src/lib/server/auth";

function ask(q: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => { if (s.includes(q)) out.output.write(s); };
  }
  return new Promise((res) => rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); res(a.trim()); }));
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--promote");
  if (pi >= 0) {
    const email = (args[pi + 1] ?? "").toLowerCase();
    const u = await prisma.user.update({ where: { email }, data: { role: "ADMIN" } }).catch(() => null);
    if (!u) throw new Error(`No account with email ${email}`);
    await prisma.auditLog.create({ data: { userId: u.id, action: "ADMIN_PROMOTED", target: u.id, detail: { by: "cli" } } });
    console.log(`Promoted ${email} to admin.`);
    return;
  }
  const email = (process.env.ADMIN_EMAIL || (await ask("Admin email: "))).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
  const name = process.env.ADMIN_NAME || "Administrator";
  const password = process.env.ADMIN_PASSWORD || (await ask("Password (min 12 chars, letters and numbers): ", true));
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("Password must be at least 12 characters and include letters and numbers.");
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("An account with this email already exists. Use --promote to make it an admin.");
  const u = await prisma.user.create({ data: { email, name, role: "ADMIN", passwordHash: await hashPassword(password) } });
  await prisma.auditLog.create({ data: { userId: u.id, action: "ADMIN_CREATED", target: u.id, detail: { by: "cli" } } });
  console.log(`Admin account created for ${email}.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
