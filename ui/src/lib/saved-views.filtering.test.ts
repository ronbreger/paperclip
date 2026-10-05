// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Issue } from "@paperclipai/shared";
import { applyIssueFilters, defaultIssueFilterState, type IssueFilterState } from "./issue-filters";
import { ATTENTION_FILTER_NEEDS_ME } from "./issue-filters";
import { taskView, taskViewGroups } from "./task-views";
import { savedViewKey, type SavedView } from "./saved-views";

/**
 * The end a user sees: four saved views over one set of tasks, each returning
 * exactly the rows it promises. Everything here goes through the same
 * `applyIssueFilters` the task list runs, so a change that breaks a view
 * breaks this.
 */

const WORKBENCH_PROJECT = "project-workbench";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Issue",
    description: null,
    status: "todo",
    workMode: "standard",
    priority: "medium",
    reviewPolicy: null,
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    responsibleUserId: null,
    issueNumber: 1,
    identifier: "BRE-1",
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Issue;
}

const issues: Issue[] = [
  makeIssue({ id: "wb-idea", projectId: WORKBENCH_PROJECT, status: "backlog", title: "WB: an idea" }),
  makeIssue({ id: "wb-promoted", projectId: WORKBENCH_PROJECT, status: "in_progress", title: "Promoted" }),
  makeIssue({ id: "other-backlog", projectId: "project-other", status: "backlog" }),
  makeIssue({ id: "running", status: "in_progress" }),
  makeIssue({ id: "reviewing", status: "in_review" }),
  makeIssue({ id: "answered", status: "todo" }),
  makeIssue({ id: "asking", status: "todo" }),
  makeIssue({ id: "shipped", status: "done" }),
];

function filters(overrides: Partial<IssueFilterState>): IssueFilterState {
  return { ...defaultIssueFilterState, ...overrides };
}

const savedViews: SavedView[] = [
  {
    id: "workbench",
    label: "Workbench",
    hint: "Parked ideas",
    filters: filters({ projects: [WORKBENCH_PROJECT], statuses: ["backlog"] }),
  },
  {
    id: "needs-ron",
    label: "Needs Ron",
    hint: "Waiting on a person",
    filters: filters({ attention: [ATTENTION_FILTER_NEEDS_ME] }),
  },
  {
    id: "active-work",
    label: "Active work",
    hint: "Being worked now",
    filters: filters({ statuses: ["in_progress"] }),
  },
  { id: "review", label: "Review", hint: "Awaiting acceptance", filters: filters({ statuses: ["in_review"] }) },
];

// Only `asking` still has a pending card; `answered` was resolved, so the
// feed no longer carries it.
const context = {
  attentionIssueIdsByToken: new Map([[ATTENTION_FILTER_NEEDS_ME, new Set(["asking"])]]),
  attentionReady: true,
};

function rowsFor(viewId: string): string[] {
  const view = taskView(savedViewKey(viewId), savedViews);
  return applyIssueFilters(issues, view.filters!, null, false, undefined, context).map((issue) => issue.id);
}

describe("the four starter views over one task set", () => {
  it("Workbench shows parked ideas in that project and nothing else", () => {
    expect(rowsFor("workbench")).toEqual(["wb-idea"]);
  });

  it("Workbench is a read-only filter — a promoted task leaves it by status alone", () => {
    // `wb-promoted` is still in the Workbench project. It drops out because
    // somebody moved it off `backlog`, which is the only thing that can
    // change an item's membership. Appearing in the view changes nothing.
    expect(rowsFor("workbench")).not.toContain("wb-promoted");
  });

  it("Needs Ron shows only what is still unresolved", () => {
    expect(rowsFor("needs-ron")).toEqual(["asking"]);
  });

  it("Active work shows what is running", () => {
    expect(rowsFor("active-work").sort()).toEqual(["running", "wb-promoted"]);
  });

  it("Review shows what is waiting for acceptance", () => {
    expect(rowsFor("review")).toEqual(["reviewing"]);
  });

  it("every view is reachable from the Views menu", () => {
    const keys = taskViewGroups(savedViews).flatMap((group) => group.views.map((view) => view.key));
    for (const saved of savedViews) expect(keys).toContain(savedViewKey(saved.id));
  });

  it("counts match the rows each view renders", () => {
    for (const saved of savedViews) {
      const view = taskView(savedViewKey(saved.id), savedViews);
      const rows = applyIssueFilters(issues, view.filters!, null, false, undefined, context);
      expect(rows.length).toBe(rowsFor(saved.id).length);
    }
  });

  it("leaves the built-in views alone", () => {
    expect(taskView("backlog").statuses).toEqual(["backlog"]);
    expect(taskView("active").statuses).toEqual(["todo", "in_progress", "in_review", "blocked"]);
    expect(taskView("mine").surface).toBe("inbox");
  });
});
