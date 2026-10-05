import type { AttentionItem, AttentionSourceKind } from "./types/attention.js";

/**
 * "Needs you" badge semantics — one rule, shared by the server badge
 * (`deskBadgeCount`) and every client that renders a count.
 *
 * The badge answers exactly one question: **how many open items are blocked on
 * a person right now?** It is not a count of what arrived today, what an agent
 * is retrying, what changed, or what someone may want to read.
 *
 * An item counts only when all of these hold:
 *
 *  1. It is a *request*: an approval, a decision, an issue-thread interaction
 *     or a join request. Operational signals (failed runs, recovery actions,
 *     blocked dependencies, reviews, budget and agent-error alerts) are status,
 *     not requests, and never count.
 *  2. Its subject is still open: an item whose task is `done` or `cancelled`
 *     has nothing left to decide.
 *  3. It is still live: not expired, not archived, not dismissed, not snoozed,
 *     and not shelved past its retention window.
 *
 * There is no clock in the rule. The count does not reset at UTC midnight and
 * does not grow because an item is "new today". An item leaves the count when
 * it is answered, withdrawn, defaulted or resolved — and only then.
 *
 * The invariant to test against: when the badge shows N, opening the queue
 * shows exactly N items, and each one is waiting on a person.
 */
export const ATTENTION_BADGE_SOURCE_KINDS = [
  "approval",
  "decision",
  "issue_thread_interaction",
  "join_request",
] as const satisfies readonly AttentionSourceKind[];

export type AttentionBadgeSourceKind = (typeof ATTENTION_BADGE_SOURCE_KINDS)[number];

const BADGE_SOURCE_KIND_SET = new Set<string>(ATTENTION_BADGE_SOURCE_KINDS);

/** Statuses that mean "there is nothing left to decide here". */
export const ATTENTION_BADGE_TERMINAL_STATUSES = ["done", "cancelled"] as const;

const TERMINAL_STATUS_SET = new Set<string>(ATTENTION_BADGE_TERMINAL_STATUSES);

export function isAttentionBadgeSourceKind(kind: string): kind is AttentionBadgeSourceKind {
  return BADGE_SOURCE_KIND_SET.has(kind);
}

function msOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isTerminal(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUS_SET.has(status);
}

/**
 * Whether a single attention item is blocked on a person right now. The one
 * place the badge rule lives; see the module comment for the rule itself.
 */
export function attentionItemNeedsPerson(item: AttentionItem, now: number): boolean {
  // 1. Requests only. Status signals are ambient and never counted.
  if (!isAttentionBadgeSourceKind(item.sourceKind)) return false;

  // 2. The subject is still open. A closed task cannot be waiting on anyone,
  //    whether the item points at the task directly or at a card inside it.
  if (isTerminal(item.subject.status)) return false;
  if (isTerminal(item.relatedIssue?.status)) return false;

  // 3. Still live.
  if (item.archivedAt) return false;
  if (item.dismissal?.isActive) return false;
  if (item.shelf) return false;
  const expiresAt = msOrNull(item.expiresAt);
  if (expiresAt !== null && expiresAt <= now) return false;
  const snoozedUntil = msOrNull(item.snoozedUntil);
  if (snoozedUntil !== null && snoozedUntil > now) return false;

  return true;
}

/** The badge number: how many of these items are blocked on a person. */
export function countAttentionBadgeItems(items: readonly AttentionItem[], now: number): number {
  let count = 0;
  for (const item of items) {
    if (attentionItemNeedsPerson(item, now)) count += 1;
  }
  return count;
}
