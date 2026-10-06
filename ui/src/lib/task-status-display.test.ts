import { describe, expect, it } from "vitest";
import { resolveTaskDisplayStatus, taskStatusDisplayLabel } from "./task-status-display";

describe("taskStatusDisplayLabel", () => {
  it("uses Paperclip's own words for the six everyday states", () => {
    expect(taskStatusDisplayLabel("in_progress")).toBe("In Progress");
    expect(taskStatusDisplayLabel("blocked")).toBe("Blocked");
    expect(taskStatusDisplayLabel("in_review")).toBe("In Review");
    expect(taskStatusDisplayLabel("todo")).toBe("Todo");
    expect(taskStatusDisplayLabel("backlog")).toBe("Backlog");
    expect(taskStatusDisplayLabel("done")).toBe("Done");
  });

  it("title-cases every other status the same way", () => {
    expect(taskStatusDisplayLabel("cancelled")).toBe("Cancelled");
    expect(taskStatusDisplayLabel("in_queue")).toBe("In Queue");
  });

  it("follows the glyph when a review waits on an external conversation", () => {
    expect(resolveTaskDisplayStatus("in_review", "waiting")).toBe("idle");
    expect(taskStatusDisplayLabel("in_review", "waiting")).toBe("Idle");
    expect(taskStatusDisplayLabel("in_review", "active")).toBe("In Review");
    expect(taskStatusDisplayLabel("in_review", null)).toBe("In Review");
  });

  it("leaves other statuses alone when an external conversation is waiting", () => {
    expect(resolveTaskDisplayStatus("blocked", "waiting")).toBe("blocked");
    expect(taskStatusDisplayLabel("blocked", "waiting")).toBe("Blocked");
  });
});
