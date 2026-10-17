import "dotenv/config";
import { PrismaClient, type OutboxJob } from "@prisma/client";

const prisma = new PrismaClient();
const maxAttempts = 5;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function claimJob(): Promise<OutboxJob | null> {
  const [job] = await prisma.$queryRaw<OutboxJob[]>`
    WITH candidate AS (
      SELECT "id" FROM "OutboxJob"
      WHERE (
        ("status" = 'PENDING' AND "availableAt" <= NOW())
        OR ("status" = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '2 minutes')
      )
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "OutboxJob" AS jobs
    SET "status" = 'PROCESSING', "lockedAt" = NOW(), "attempts" = jobs."attempts" + 1
    FROM candidate
    WHERE jobs."id" = candidate."id"
    RETURNING jobs.*
  `;
  return job ?? null;
}

async function processJob(job: OutboxJob) {
  if (job.kind !== "ITEM_CREATED" && job.kind !== "ITEM_ASSIGNED" && job.kind !== "ITEM_CLAIMED") {
    throw new Error(`Unsupported outbox event: ${job.kind}`);
  }
  console.info(`[outbox:${job.id}] ${job.kind}`, job.payload);
  await prisma.outboxJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", processedAt: new Date(), lockedAt: null, lastError: null },
  });
}

async function failJob(job: OutboxJob, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown worker error";
  const exhausted = job.attempts >= maxAttempts;
  const delaySeconds = Math.min(300, 2 ** job.attempts * 5);
  await prisma.outboxJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      availableAt: exhausted ? job.availableAt : new Date(Date.now() + delaySeconds * 1000),
      lockedAt: null,
      lastError: message,
    },
  });
  console.error(`[outbox:${job.id}] ${exhausted ? "permanently failed" : "retry scheduled"}`, message);
}

async function run() {
  console.info("Newtonite outbox worker started.");
  while (true) {
    try {
      const job = await claimJob();
      if (!job) {
        await sleep(1_000);
        continue;
      }
      try {
        await processJob(job);
      } catch (error) {
        await failJob(job, error);
      }
    } catch (error) {
      console.error("Outbox polling failed; retrying in 5 seconds.", error);
      await sleep(5_000);
    }
  }
}

run().catch(async (error) => {
  console.error("Outbox worker stopped unexpectedly.", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
