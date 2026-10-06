/**
 * Plain-language status words for task rows.
 *
 * Display only. The stored status values are untouched: a row reading "Doing"
 * is still `in_progress` everywhere else — filters, the status picker, the API
 * and the database. Nothing here is written back.
 *
 * The status picker keeps its own wording on purpose: these words are tuned
 * for scanning a list, and a picker needs the stored names.
 *
 * `backlog` reads "Parked" rather than sharing "Later" with `todo`, so a task
 * queued up and a task set aside can be told apart at a glance.
 */
const TASK_STATUS_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  in_progress: "Doing",
  blocked: "Waiting",
  in_review: "Review",
  todo: "Later",
  backlog: "Parked",
  done: "Done",
};

/** Title-cases an unmapped status the same way `StatusIcon` does. */
function fallbackLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The glyph swaps to the `idle` shape when a review is waiting on an external
 * conversation. The word has to follow it, or the row shows one state and
 * reads another.
 */
export function resolveTaskDisplayStatus(
  status: string,
  externalConversationState?: "active" | "waiting" | null,
): string {
  return status === "in_review" && externalConversationState === "waiting" ? "idle" : status;
}

/** The word shown beside the status glyph in a task row. */
export function taskStatusDisplayLabel(
  status: string,
  externalConversationState?: "active" | "waiting" | null,
): string {
  const displayStatus = resolveTaskDisplayStatus(status, externalConversationState);
  return TASK_STATUS_DISPLAY_LABELS[displayStatus] ?? fallbackLabel(displayStatus);
}
