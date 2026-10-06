/**
 * The status word shown beside the glyph in a task row.
 *
 * Display only, and deliberately Paperclip's own terminology — `in_progress`
 * reads "In Progress", not a local synonym. The stored status values are
 * untouched: a row reading "In Progress" is still `in_progress` everywhere
 * else — filters, the status picker, the API and the database.
 *
 * This is the same rule `StatusIcon` applies for its `showLabel` text, so a
 * row and a detail header never disagree about a task.
 */

/** Title-cases a stored status the same way `StatusIcon` does. */
function statusLabel(status: string): string {
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
  return statusLabel(resolveTaskDisplayStatus(status, externalConversationState));
}
