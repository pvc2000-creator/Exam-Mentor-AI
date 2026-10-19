import { prisma } from "./db";

/** Everything stored about one student, for the data-export right. Never includes the password hash or session tokens. */
export async function exportAccount(userId: string) {
  const [user, mocks, attempts, responses, states, snapshots, recs, milestones] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, preferredLanguage: true, createdAt: true } }),
    prisma.mockTest.findMany({ where: { userId }, include: { questions: { select: { questionId: true, position: true, slotCategory: true, reason: true, previouslySeen: true } } } }),
    prisma.attempt.findMany({ where: { userId } }),
    prisma.response.findMany({ where: { userId }, omit: { userId: true } }),
    prisma.studentSkillState.findMany({ where: { userId } }),
    prisma.masterySnapshot.findMany({ where: { userId } }),
    prisma.recommendation.findMany({ where: { userId } }),
    prisma.masteryMilestone.findMany({ where: { userId } }),
  ]);
  return { exportedAt: new Date().toISOString(), format: "exammentor-account-export/1", user, mocks, attempts, responses, skillStates: states, masterySnapshots: snapshots, recommendations: recs, milestones };
}

/** Deletes the student and, by cascade, every row derived from them. The audit entry records no personal data. */
export async function deleteAccount(userId: string) {
  await prisma.$transaction([
    prisma.auditLog.create({ data: { userId: null, action: "ACCOUNT_DELETED", target: null, detail: { by: "self" } } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
