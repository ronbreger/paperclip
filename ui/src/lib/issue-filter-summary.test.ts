// @vitest-environment node

import { describe, expect, it } from "vitest";
import { defaultIssueFilterState } from "./issue-filters";
import { describeIssueFilters } from "./issue-filter-summary";

describe("describeIssueFilters", () => {
  it("names an empty filter set rather than returning a blank line", () => {
    expect(describeIssueFilters(defaultIssueFilterState)).toBe("Every task in the organization");
  });

  it("reads statuses back in plain language", () => {
    expect(describeIssueFilters({ ...defaultIssueFilterState, statuses: ["in_progress", "in_review"] }))
      .toBe("In Progress, In Review");
  });

  it("uses names when it has them and counts when it does not", () => {
    const filters = { ...defaultIssueFilterState, projects: ["p1", "p2"] };
    expect(describeIssueFilters(filters, { projectNameById: new Map([["p1", "Workbench"], ["p2", "Ops"]]) }))
      .toBe("Workbench, Ops");
    expect(describeIssueFilters(filters, { projectNameById: new Map([["p1", "Workbench"]]) }))
      .toBe("2 projects");
    expect(describeIssueFilters(filters)).toBe("2 projects");
  });

  it("spells out the attention token instead of showing the raw value", () => {
    expect(describeIssueFilters({ ...defaultIssueFilterState, attention: ["needs_me"] }))
      .toBe("Awaiting a person");
  });

  it("separates the assignee sentinels from real assignees", () => {
    expect(describeIssueFilters({ ...defaultIssueFilterState, assignees: ["__me", "__unassigned"] }))
      .toBe("Assigned to you · Unassigned");
  });

  it("joins several dimensions in a single line", () => {
    const summary = describeIssueFilters(
      { ...defaultIssueFilterState, statuses: ["backlog"], projects: ["p1"], liveOnly: true },
      { projectNameById: new Map([["p1", "Workbench"]]) },
    );
    expect(summary).toBe("Backlog · Workbench · Running now");
  });
});
