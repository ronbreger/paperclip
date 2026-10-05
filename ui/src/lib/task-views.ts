import type { InboxTab } from "./inbox";
import type { IssueFilterState } from "./issue-filters";
import {
  findSavedView,
  isSavedViewKey,
  parseSavedViewId,
  savedViewKey,
  type SavedTaskViewKey,
  type SavedView,
} from "./saved-views";

/**
 * The single view registry behind the merged Tasks surface (PAP-670).
 *
 * Inbox stopped being its own nav row and its five tabs became views inside
 * Tasks, alongside the status presets that used to live only inside the task
 * list's filter popover. Every view is addressed as `/issues?view=<key>`.
 *
 * Each view declares which surface renders it:
 *   - `inbox`  — the attention-ordered inbox list (unread state, archive,
 *                date groups, mixed approval/failed-run/join-request rows).
 *   - `issues` — the task collection list (board/list modes, filters, columns).
 *
 * Views are *not* reimplemented on the other surface: pointing a view at the
 * component that already owns those behaviours is what keeps them intact.
 */
export const TASK_VIEW_KEYS = [
  "mine",
  "unread",
  "blocked",
  "recent",
  "everything",
  "all",
  "active",
  "backlog",
  "done",
] as const;

export type BuiltInTaskViewKey = (typeof TASK_VIEW_KEYS)[number];
/**
 * A view key is either one of the built-ins above or `saved:<id>` — a view the
 * user named out of their own filters. Both are addressed the same way, so the
 * Views menu, the `?view=` param and the last-used memory need no second code
 * path.
 */
export type TaskViewKey = BuiltInTaskViewKey | SavedTaskViewKey;
export type TaskViewSurface = "inbox" | "issues";

export interface TaskView {
  key: TaskViewKey;
  label: string;
  surface: TaskViewSurface;
  /** Which inbox tab renders this view (`inbox` surface only). */
  inboxTab?: InboxTab;
  /** Status filter applied on entry (`issues` surface only). */
  statuses?: string[];
  /**
   * The whole filter set a saved view opens with (`issues` surface only).
   * Built-in views express their preset through `statuses` instead, which is
   * all any of them needs.
   */
  filters?: IssueFilterState;
  /** Present only on saved views; the id to rename or delete. */
  savedViewId?: string;
  /** One-line description shown in the Views menu. */
  hint: string;
}

export interface TaskViewGroup {
  label: string;
  views: TaskView[];
}

export const TASK_VIEW_GROUPS: TaskViewGroup[] = [
  {
    label: "My work",
    views: [
      { key: "mine", label: "Mine", surface: "inbox", inboxTab: "mine", hint: "Assigned to you or waiting on you" },
      { key: "unread", label: "Unread", surface: "inbox", inboxTab: "unread", hint: "Tasks you touched with new activity" },
      { key: "blocked", label: "Blocked", surface: "inbox", inboxTab: "blocked", hint: "Blocked tasks, grouped by blocker" },
      { key: "recent", label: "Recent", surface: "inbox", inboxTab: "recent", hint: "Everything you touched lately" },
      { key: "everything", label: "Everything", surface: "inbox", inboxTab: "all", hint: "Tasks, approvals, failed runs and join requests" },
    ],
  },
  {
    label: "Organization",
    views: [
      { key: "all", label: "All tasks", surface: "issues", statuses: [], hint: "Every task in the organization" },
      { key: "active", label: "Active", surface: "issues", statuses: ["todo", "in_progress", "in_review", "blocked"], hint: "Open tasks, running or not" },
      { key: "backlog", label: "Backlog", surface: "issues", statuses: ["backlog"], hint: "Not started yet" },
      { key: "done", label: "Done", surface: "issues", statuses: ["done", "cancelled"], hint: "Completed and cancelled" },
    ],
  },
];

const VIEWS_BY_KEY = new Map<BuiltInTaskViewKey, TaskView>(
  TASK_VIEW_GROUPS.flatMap((group) => group.views.map((view) => [view.key as BuiltInTaskViewKey, view] as const)),
);

export const DEFAULT_TASK_VIEW: TaskViewKey = "mine";
export const TASK_VIEW_PARAM = "view";
export const TASK_LAST_VIEW_KEY = "paperclip:tasks:last-view";
export const SAVED_VIEW_GROUP_LABEL = "Saved views";

export function isBuiltInTaskViewKey(value: unknown): value is BuiltInTaskViewKey {
  return typeof value === "string" && VIEWS_BY_KEY.has(value as BuiltInTaskViewKey);
}

/** A saved key only counts as a view key while that saved view still exists. */
export function isTaskViewKey(value: unknown, savedViews: readonly SavedView[] = []): value is TaskViewKey {
  if (isBuiltInTaskViewKey(value)) return true;
  return findSavedView(savedViews, parseSavedViewId(value)) != null;
}

/** Turns a saved view into the same shape the menu renders built-ins with. */
export function savedTaskView(view: SavedView): TaskView {
  return {
    key: savedViewKey(view.id),
    label: view.label,
    surface: "issues",
    filters: view.filters,
    savedViewId: view.id,
    hint: view.hint,
  };
}

/**
 * Resolves a key to its view. Built-ins need no second argument; a saved key
 * needs the list it lives in. A saved key whose view is gone (a stale
 * bookmark, a view deleted on another tab) falls back to the default view
 * rather than throwing — `normalizeTaskViewKey` already rejects those before
 * they get here, so this is a guard, not a path.
 */
export function taskView(key: TaskViewKey, savedViews: readonly SavedView[] = []): TaskView {
  if (isBuiltInTaskViewKey(key)) return VIEWS_BY_KEY.get(key)!;
  const saved = findSavedView(savedViews, parseSavedViewId(key));
  return saved ? savedTaskView(saved) : VIEWS_BY_KEY.get(DEFAULT_TASK_VIEW as BuiltInTaskViewKey)!;
}

/** Resolves a `?view=` value, falling back to `null` so callers can pick a default. */
export function normalizeTaskViewKey(
  value: string | null | undefined,
  savedViews: readonly SavedView[] = [],
): TaskViewKey | null {
  return isTaskViewKey(value, savedViews) ? value : null;
}

/** The built-in groups plus the user's own, for the Views menu. */
export function taskViewGroups(savedViews: readonly SavedView[] = []): TaskViewGroup[] {
  if (savedViews.length === 0) return TASK_VIEW_GROUPS;
  return [
    ...TASK_VIEW_GROUPS,
    { label: SAVED_VIEW_GROUP_LABEL, views: savedViews.map(savedTaskView) },
  ];
}

export function taskViewPath(key: TaskViewKey): string {
  return `/issues?${TASK_VIEW_PARAM}=${key}`;
}

/** Inbox tab → view key, for redirecting the retired `/inbox/*` URLs. */
const VIEW_BY_INBOX_TAB: Record<InboxTab, TaskViewKey> = {
  mine: "mine",
  unread: "unread",
  blocked: "blocked",
  recent: "recent",
  all: "everything",
};

export function taskViewForInboxTab(tab: string | null | undefined): TaskViewKey {
  return (tab && tab in VIEW_BY_INBOX_TAB)
    ? VIEW_BY_INBOX_TAB[tab as InboxTab]
    : DEFAULT_TASK_VIEW;
}

export function loadLastTaskView(savedViews: readonly SavedView[] = []): TaskViewKey {
  try {
    return normalizeTaskViewKey(window.localStorage.getItem(TASK_LAST_VIEW_KEY), savedViews)
      ?? DEFAULT_TASK_VIEW;
  } catch {
    return DEFAULT_TASK_VIEW;
  }
}

export function saveLastTaskView(key: TaskViewKey): void {
  try {
    window.localStorage.setItem(TASK_LAST_VIEW_KEY, key);
  } catch {
    /* Navigation still works without storage; the default view just returns. */
  }
}

/**
 * Query params that only the organization task list understands. A deep link
 * carrying one of these (the dashboard's "assigned to me", a workspace
 * drill-in, a search hand-off) must not land on a My-work view, so it resolves
 * to `All tasks` instead of the user's last-used view.
 */
export const ORGANIZATION_SCOPED_PARAMS = [
  "assignee",
  "workspace",
  "participantAgentId",
  "q",
] as const;

/** Resolves which view a `/issues` visit opens. */
export function resolveInitialTaskView(
  requested: string | null,
  hasOrganizationScopedParam: boolean,
  lastUsed: TaskViewKey,
  savedViews: readonly SavedView[] = [],
): TaskViewKey {
  const explicit = normalizeTaskViewKey(requested, savedViews);
  // Inbox views can't apply organization filters, so a link carrying one
  // opens All tasks rather than silently dropping the filter. Saved views
  // render on the task list, so they keep the filter and stay put.
  if (hasOrganizationScopedParam && (!explicit || taskView(explicit, savedViews).surface === "inbox")) return "all";
  return explicit ?? lastUsed;
}

/** Re-exported so callers resolving a view key don't need both modules. */
export { isSavedViewKey, parseSavedViewId, savedViewKey };
