import {
  ATTENTION_FILTER_NEEDS_ME,
  externalObjectFilterLabel,
  issueFilterLabel,
  type IssueFilterState,
} from "./issue-filters";

export interface IssueFilterSummaryContext {
  projectNameById?: ReadonlyMap<string, string>;
  agentNameById?: ReadonlyMap<string, string>;
  labelNameById?: ReadonlyMap<string, string>;
}

const ATTENTION_LABELS: Record<string, string> = {
  [ATTENTION_FILTER_NEEDS_ME]: "Awaiting a person",
};

function named(
  ids: string[],
  lookup: ReadonlyMap<string, string> | undefined,
  fallbackNoun: string,
): string | null {
  if (ids.length === 0) return null;
  const names = ids.map((id) => lookup?.get(id)).filter((name): name is string => !!name);
  if (names.length === ids.length) return names.join(", ");
  return `${ids.length} ${fallbackNoun}${ids.length === 1 ? "" : "s"}`;
}

/**
 * One line of plain language for a filter set — the hint under a saved view's
 * name, and the confirmation in the save dialog. Falls back to counting
 * ("3 assignees") whenever a name is not available, so the summary never
 * shows a raw id.
 */
export function describeIssueFilters(
  filters: IssueFilterState,
  context: IssueFilterSummaryContext = {},
): string {
  const parts: (string | null)[] = [
    filters.statuses.length > 0 ? filters.statuses.map(issueFilterLabel).join(", ") : null,
    filters.priorities.length > 0
      ? `${filters.priorities.map(issueFilterLabel).join(", ")} priority`
      : null,
    named(filters.projects, context.projectNameById, "project"),
    named(filters.assignees.filter((id) => !id.startsWith("__")), context.agentNameById, "assignee"),
    filters.assignees.includes("__me") ? "Assigned to you" : null,
    filters.assignees.includes("__unassigned") ? "Unassigned" : null,
    named(filters.labels, context.labelNameById, "label"),
    filters.workspaces.length > 0
      ? `${filters.workspaces.length} workspace${filters.workspaces.length === 1 ? "" : "s"}`
      : null,
    filters.attention.length > 0
      ? filters.attention.map((token) => ATTENTION_LABELS[token] ?? issueFilterLabel(token)).join(", ")
      : null,
    filters.externalObjectStatuses.length > 0
      ? filters.externalObjectStatuses.map(externalObjectFilterLabel).join(", ")
      : null,
    filters.liveOnly ? "Running now" : null,
    filters.hideRoutineExecutions ? "Routine runs hidden" : null,
  ];
  const summary = parts.filter((part): part is string => !!part).join(" · ");
  return summary || "Every task in the organization";
}
