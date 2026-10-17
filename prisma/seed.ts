import "dotenv/config";
import { PrismaClient, type Priority, type WorkStatus, type WorkType } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const demoPassword = "OpsDemo2026!";

async function main() {
  const passwordHash = await hash(demoPassword, 10);
  const teams = await Promise.all(
    ["Operations", "Customer Support", "Finance & Risk"].map((name) =>
      prisma.team.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );
  const [operations, support, finance] = teams;

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@newtonite.demo" },
      update: { name: "Alex Morgan", passwordHash },
      create: { name: "Alex Morgan", email: "admin@newtonite.demo", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "lead@newtonite.demo" },
      update: { name: "Jordan Lee", passwordHash },
      create: { name: "Jordan Lee", email: "lead@newtonite.demo", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "member@newtonite.demo" },
      update: { name: "Sam Patel", passwordHash },
      create: { name: "Sam Patel", email: "member@newtonite.demo", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "viewer@newtonite.demo" },
      update: { name: "Taylor Kim", passwordHash },
      create: { name: "Taylor Kim", email: "viewer@newtonite.demo", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "finance@newtonite.demo" },
      update: { name: "Riley Chen", passwordHash },
      create: { name: "Riley Chen", email: "finance@newtonite.demo", passwordHash },
    }),
  ]);
  const [admin, lead, member, viewer, financeMember] = users;
  const memberships = [
    [admin.id, operations.id, "ADMIN"],
    [lead.id, operations.id, "LEAD"],
    [lead.id, support.id, "LEAD"],
    [member.id, operations.id, "MEMBER"],
    [member.id, support.id, "MEMBER"],
    [viewer.id, operations.id, "VIEWER"],
    [financeMember.id, finance.id, "MEMBER"],
  ] as const;
  for (const [userId, teamId, role] of memberships) {
    await prisma.membership.upsert({
      where: { userId_teamId: { userId, teamId } },
      update: { role },
      create: { userId, teamId, role },
    });
  }

  if (await prisma.workItem.count() === 0) {
    const teamIds = teams.map((team) => team.id);
    const usersByTeam = [
      [admin.id, lead.id, member.id],
      [lead.id, member.id],
      [financeMember.id],
    ];
    const titles = [
      "Investigate elevated checkout timeouts",
      "Reconcile duplicate settlement entries",
      "Review customer access request",
      "Confirm production alert escalation",
      "Resolve delayed refund investigation",
      "Validate month-end approval evidence",
    ];
    const items = Array.from({ length: 1200 }, (_, index) => {
      const status: WorkStatus = index % 31 === 0
        ? "AWAITING_APPROVAL"
        : index % 17 === 0 ? "RESOLVED" : index % 4 === 0 ? "IN_PROGRESS" : "OPEN";
      const priority: Priority = index % 29 === 0
        ? "URGENT" : index % 5 === 0 ? "HIGH" : index % 3 === 0 ? "MEDIUM" : "LOW";
      const type: WorkType[] = ["INCIDENT", "CUSTOMER_ISSUE", "PAYMENT", "COMPLIANCE", "TASK"];
      const teamIndex = index % teamIds.length;
      const teamId = teamIds[teamIndex];
      const teamUsers = usersByTeam[teamIndex];
      const assigneeId = index % 4 === 0 ? null : teamUsers[index % teamUsers.length];
      return {
        title: `${titles[index % titles.length]}${index > 5 ? ` · ${String(index).padStart(4, "0")}` : ""}`,
        description: `Operational follow-up ${index + 1}. Validate the customer or system impact, record the evidence, and leave a clear handoff for the next owner.`,
        type: type[index % type.length],
        priority,
        status,
        teamId,
        assigneeId,
        createdById: teamUsers[(index + 1) % teamUsers.length],
        dueAt: index % 3 === 0 ? new Date(Date.now() + (index % 7 - 3) * 86_400_000) : null,
      };
    });
    await prisma.workItem.createMany({ data: items });
    const seededItems = await prisma.workItem.findMany({ select: { id: true, createdById: true } });
    await prisma.activityEvent.createMany({
      data: seededItems.map((item) => ({
        itemId: item.id,
        actorId: item.createdById,
        type: "CREATED" as const,
        message: "Created this work item.",
      })),
    });
    const first = seededItems[0];
    if (first) {
      await prisma.comment.create({
        data: {
          itemId: first.id,
          authorId: lead.id,
          body: "I am reviewing the latest handoff and will confirm the next action here.",
        },
      });
    }
  }

  console.log(`Seeded ${await prisma.workItem.count()} work items. Shared demo password: ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error("Database seeding failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
