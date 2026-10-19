import { describe, expect, it } from "vitest";
import { jar, makeUser, signInAs, req, json } from "./helpers";
import { prisma } from "@/lib/server/db";
import { hashToken, userFromToken, verifyPassword, createSession } from "@/lib/server/auth";
import { POST as createMockRoute } from "@/app/api/mocks/route";
import { POST as importRoute } from "@/app/api/admin/import/route";

describe("authentication", () => {
  it("stores bcrypt hashes and only hashed session tokens", async () => {
    const { user, token } = await makeUser();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("correct-horse-42", row.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", row.passwordHash)).toBe(false);
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await prisma.session.findFirst({ where: { tokenHash: hashToken(token) } })).not.toBeNull();
    expect((await userFromToken(token))?.id).toBe(user.id);
  });

  it("rejects expired, unknown and oversized tokens", async () => {
    const { user } = await makeUser();
    const { token } = await createSession(user.id);
    await prisma.session.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await userFromToken(token)).toBeNull();
    expect(await userFromToken("not-a-real-token")).toBeNull();
    expect(await userFromToken("x".repeat(500))).toBeNull();
  });

  it("API routes require a session", async () => {
    signInAs(null);
    expect((await json(await createMockRoute(req("POST", { type: "DIAGNOSTIC" })))).status).toBe(401);
    expect(jar.size).toBe(0);
  });

  it("students cannot use admin endpoints", async () => {
    const { token } = await makeUser("STUDENT");
    signInAs(token);
    const fd = new FormData();
    fd.set("file", new File(["topic_id,stem\n"], "x.csv", { type: "text/csv" }));
    const res = await importRoute(new Request("http://localhost/api/admin/import", { method: "POST", body: fd }));
    expect(res.status).toBe(403);
  });

  it("validates request bodies", async () => {
    const { token } = await makeUser();
    signInAs(token);
    const r = await json(await createMockRoute(req("POST", { type: "NOT_A_TYPE" })));
    expect(r.status).toBe(400);
    expect(String(r.body?.error)).toMatch(/Invalid request/);
  });
});
