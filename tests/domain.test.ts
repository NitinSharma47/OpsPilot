import { describe, expect, it } from "vitest";
import { roleAtLeast } from "../src/lib/permissions";
import { assertClaimEligible, assertTransition } from "../src/lib/workflow";

describe("work-item policy", () => {
  it("allows forward progress and member requests for review", () => {
    expect(() => assertTransition("OPEN", "IN_PROGRESS", "MEMBER")).not.toThrow();
    expect(() => assertTransition("IN_PROGRESS", "AWAITING_APPROVAL", "MEMBER")).not.toThrow();
  });

  it("keeps approval and closure with team leads", () => {
    expect(() => assertTransition("AWAITING_APPROVAL", "RESOLVED", "MEMBER"))
      .toThrow("Only a team lead or admin can approve or close work.");
    expect(() => assertTransition("AWAITING_APPROVAL", "RESOLVED", "LEAD")).not.toThrow();
    expect(() => assertTransition("RESOLVED", "CLOSED", "ADMIN")).not.toThrow();
  });

  it("rejects invalid state jumps even for an administrator", () => {
    expect(() => assertTransition("OPEN", "CLOSED", "ADMIN"))
      .toThrow("Cannot move a work item from OPEN to CLOSED.");
  });

  it("prevents work that is already resolved or closed from being claimed", () => {
    expect(() => assertClaimEligible("OPEN")).not.toThrow();
    expect(() => assertClaimEligible("RESOLVED")).toThrow("Resolved or closed work cannot be claimed.");
    expect(() => assertClaimEligible("CLOSED")).toThrow("Resolved or closed work cannot be claimed.");
  });

  it("orders team roles without granting write access to viewers", () => {
    expect(roleAtLeast("VIEWER", "MEMBER")).toBe(false);
    expect(roleAtLeast("MEMBER", "MEMBER")).toBe(true);
    expect(roleAtLeast("ADMIN", "LEAD")).toBe(true);
  });
});
