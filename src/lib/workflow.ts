import { TeamRole, WorkStatus } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { roleAtLeast } from "@/lib/permissions";

const transitions: Record<WorkStatus, WorkStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["OPEN", "AWAITING_APPROVAL"],
  AWAITING_APPROVAL: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

export function assertTransition(from: WorkStatus, to: WorkStatus, role: TeamRole) {
  if (!transitions[from].includes(to)) {
    throw new ApiError(422, `Cannot move a work item from ${from} to ${to}.`);
  }
  if ((from === "AWAITING_APPROVAL" || to === "CLOSED") &&
      !roleAtLeast(role, "LEAD")) {
    throw new ApiError(403, "Only a team lead or admin can approve or close work.");
  }
}

export function assertClaimEligible(status: WorkStatus) {
  if (status === "RESOLVED" || status === "CLOSED") {
    throw new ApiError(409, "Resolved or closed work cannot be claimed.");
  }
}
