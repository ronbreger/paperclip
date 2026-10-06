import { describe, expect, it } from "vitest";
import { resolveTaskDisplayStatus, taskStatusDisplayLabel } from "./task-status-display";

describe("taskStatusDisplayLabel", () => {
  it("maps the five everyday states to plain words", () => {
    expect(taskStatusDisplayLabel("in_progress")).toBe("Doing");
    expect(taskStatusDisplayLabel("blocked")).toBe("Waiting");
    expect(taskStatusDisplayLabel("in_review")).toBe("Review");
    expect(taskStatusDisplayLabel("todo")).toBe("Later");
    expect(taskStatusDisplayLabel("backlog")).toBe("Parked");
    expect(taskStatusDisplayLabel("done")).toBe("Done");
  });

  it("title-cases anything it does not map", () => {
    expect(taskStatusDisplayLabel("cancelled")).toBe("Cancelled");
    expect(taskStatusDisplayLabel("in_queue")).toBe("In Queue");
  });

  it("follows the glyph when a review waits on an external conversation", () => {
    expect(resolveTaskDisplayStatus("in_review", "waiting")).toBe("idle");
    expect(taskStatusDisplayLabel("in_review", "waiting")).toBe("Idle");
    expect(taskStatusDisplayLabel("in_review", "active")).toBe("Review");
    expect(taskStatusDisplayLabel("in_review", null)).toBe("Review");
  });

  it("leaves other statuses alone when an external conversation is waiting", () => {
    expect(resolveTaskDisplayStatus("blocked", "waiting")).toBe("blocked");
    expect(taskStatusDisplayLabel("blocked", "waiting")).toBe("Waiting");
  });
});
