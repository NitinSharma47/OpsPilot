import { type Priority, type WorkStatus, type WorkType } from "@prisma/client";
import { z } from "zod";

export const workTypes = ["INCIDENT", "CUSTOMER_ISSUE", "PAYMENT", "COMPLIANCE", "TASK"] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const statuses = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "RESOLVED", "CLOSED"] as const;

const title = z.string().trim().min(3).max(160);
const description = z.string().trim().min(1).max(10_000);

export const createItemSchema = z.object({
  title,
  description,
  type: z.enum(workTypes),
  priority: z.enum(priorities).default("MEDIUM"),
  teamId: z.string().min(1),
  dueAt: z.iso.datetime().optional().nullable(),
});

export const updateItemSchema = z.object({
  version: z.number().int().positive(),
  title: title.optional(),
  description: description.optional(),
  priority: z.enum(priorities).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "version"), "At least one field must be updated.");

export const transitionSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(statuses),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type PriorityValue = Priority;
export type StatusValue = WorkStatus;
export type WorkTypeValue = WorkType;
