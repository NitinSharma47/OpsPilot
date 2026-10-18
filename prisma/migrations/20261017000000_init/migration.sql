CREATE TYPE "TeamRole" AS ENUM ('VIEWER', 'MEMBER', 'LEAD', 'ADMIN');
CREATE TYPE "WorkType" AS ENUM ('INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "WorkStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED');
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'UPDATED', 'CLAIMED', 'ASSIGNED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'COMMENTED', 'NOTE_DELETED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Team" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Membership" (
  "userId" TEXT NOT NULL, "teamId" TEXT NOT NULL, "role" "TeamRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId", "teamId")
);
CREATE TABLE "WorkItem" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "type" "WorkType" NOT NULL, "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "WorkStatus" NOT NULL DEFAULT 'OPEN', "teamId" TEXT NOT NULL,
  "assigneeId" TEXT, "createdById" TEXT NOT NULL, "dueAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ActivityEvent" (
  "id" TEXT NOT NULL, "itemId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "type" "ActivityType" NOT NULL, "message" TEXT NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Comment" (
  "id" TEXT NOT NULL, "itemId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IdempotencyKey" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "key" TEXT NOT NULL,
  "itemId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OutboxJob" (
  "id" TEXT NOT NULL, "itemId" TEXT NOT NULL, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "processedAt" TIMESTAMP(3),
  "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
CREATE INDEX "Membership_teamId_role_idx" ON "Membership"("teamId", "role");
CREATE INDEX "WorkItem_teamId_status_priority_createdAt_id_idx" ON "WorkItem"("teamId", "status", "priority", "createdAt", "id");
CREATE INDEX "WorkItem_teamId_assigneeId_status_createdAt_id_idx" ON "WorkItem"("teamId", "assigneeId", "status", "createdAt", "id");
CREATE INDEX "WorkItem_createdAt_id_idx" ON "WorkItem"("createdAt", "id");
CREATE INDEX "WorkItem_title_trgm_idx" ON "WorkItem" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "WorkItem_description_trgm_idx" ON "WorkItem" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "ActivityEvent_itemId_createdAt_id_idx" ON "ActivityEvent"("itemId", "createdAt", "id");
CREATE INDEX "Comment_itemId_createdAt_id_idx" ON "Comment"("itemId", "createdAt", "id");
CREATE UNIQUE INDEX "IdempotencyKey_itemId_key" ON "IdempotencyKey"("itemId");
CREATE UNIQUE INDEX "IdempotencyKey_userId_key_key" ON "IdempotencyKey"("userId", "key");
CREATE INDEX "OutboxJob_status_availableAt_createdAt_idx" ON "OutboxJob"("status", "availableAt", "createdAt");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxJob" ADD CONSTRAINT "OutboxJob_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
