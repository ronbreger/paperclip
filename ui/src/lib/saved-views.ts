import {
  ATTENTION_FILTER_NEEDS_ME,
  defaultIssueFilterState,
  normalizeIssueFilterState,
  type IssueFilterState,
} from "./issue-filters";

/**
 * Saved views — a named filter set the user can return to.
 *
 * The built-in views (`task-views.ts`) carry at most a status preset, which is
 * all the Inbox merge needed. A saved view carries a whole `IssueFilterState`,
 * so "the backlog of one project", "everything waiting on me" and "what I am
 * working on right now" are the same mechanism rather than three screens.
 *
 * Deliberately *not* a new data store: a saved view holds filters, and the
 * task list it opens is the same list every other view renders.
 *
 * Storage is the browser, per organization, alongside every other task-list
 * preference (`paperclip:issues-view`, `paperclip:tasks:last-view`). The
 * starter views below are seeded in code, so they are present on a device that
 * has never saved anything — a phone, a new browser — with nothing to sync.
 */
export interface SavedView {
  id: string;
  label: string;
  /** One-line description shown under the label in the Views menu. */
  hint: string;
  filters: IssueFilterState;
}

export const SAVED_VIEW_PREFIX = "saved:";
export const SAVED_VIEWS_KEY_PREFIX = "paperclip:tasks:saved-views";
export const SAVED_VIEW_LABEL_MAX_LENGTH = 60;
/** A menu, not a database. Past this the list stops being scannable. */
export const SAVED_VIEW_LIMIT = 50;

/** A view key addressable as `/issues?view=saved:<id>`. */
export type SavedTaskViewKey = `${typeof SAVED_VIEW_PREFIX}${string}`;

export function savedViewKey(id: string): SavedTaskViewKey {
  return `${SAVED_VIEW_PREFIX}${id}`;
}

export function isSavedViewKey(value: unknown): value is SavedTaskViewKey {
  return typeof value === "string"
    && value.startsWith(SAVED_VIEW_PREFIX)
    && value.length > SAVED_VIEW_PREFIX.length;
}

export function parseSavedViewId(value: unknown): string | null {
  return isSavedViewKey(value) ? value.slice(SAVED_VIEW_PREFIX.length) : null;
}

export function savedViewsStorageKey(companyId: string | null | undefined): string {
  return companyId ? `${SAVED_VIEWS_KEY_PREFIX}:${companyId}` : SAVED_VIEWS_KEY_PREFIX;
}

function filters(overrides: Partial<IssueFilterState>): IssueFilterState {
  return { ...defaultIssueFilterState, ...overrides };
}

/**
 * Seeded on a device that has never saved a view. Every one of these is a
 * plain filter set the user could have built in the Filters popover, and each
 * can be renamed or deleted like any other saved view.
 */
export const STARTER_SAVED_VIEWS: readonly SavedView[] = [
  {
    id: "active-work",
    label: "Active work",
    hint: "Tasks being worked right now",
    filters: filters({ statuses: ["in_progress"] }),
  },
  {
    id: "review",
    label: "Review",
    hint: "Work waiting for review or acceptance",
    filters: filters({ statuses: ["in_review"] }),
  },
  {
    id: "awaiting-you",
    label: "Awaiting you",
    hint: "Decisions, approvals and join requests waiting on you",
    filters: filters({ attention: [ATTENTION_FILTER_NEEDS_ME] }),
  },
];

export function newSavedViewId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `v${Date.now().toString(36)}${random}`;
}

export function normalizeSavedViewLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, SAVED_VIEW_LABEL_MAX_LENGTH) : "";
}

export function normalizeSavedView(value: unknown): SavedView | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Record<keyof SavedView, unknown>>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const label = normalizeSavedViewLabel(candidate.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    hint: typeof candidate.hint === "string" ? candidate.hint.trim() : "",
    filters: normalizeIssueFilterState(candidate.filters),
  };
}

export function normalizeSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: SavedView[] = [];
  for (const entry of value) {
    const view = normalizeSavedView(entry);
    if (!view || seen.has(view.id)) continue;
    seen.add(view.id);
    views.push(view);
    if (views.length >= SAVED_VIEW_LIMIT) break;
  }
  return views;
}

/**
 * Reads the stored views, seeding the starters the first time. An empty array
 * that was deliberately stored stays empty — only a missing or unreadable key
 * seeds, so deleting every view does not resurrect them on the next render.
 */
export function loadSavedViews(companyId: string | null | undefined): SavedView[] {
  try {
    const raw = localStorage.getItem(savedViewsStorageKey(companyId));
    if (raw == null) return STARTER_SAVED_VIEWS.map((view) => ({ ...view }));
    return normalizeSavedViews(JSON.parse(raw));
  } catch {
    return STARTER_SAVED_VIEWS.map((view) => ({ ...view }));
  }
}

/**
 * Returns whether the write landed. A caller must not show a view as saved
 * when storage refused it — private browsing and a full quota both throw, and
 * a view that silently disappears on reload is worse than a clear refusal.
 */
export function saveSavedViews(companyId: string | null | undefined, views: SavedView[]): boolean {
  try {
    localStorage.setItem(savedViewsStorageKey(companyId), JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/** Replaces a view with the same id, otherwise appends. Returns the new list. */
export function upsertSavedView(views: SavedView[], view: SavedView): SavedView[] {
  const index = views.findIndex((existing) => existing.id === view.id);
  if (index >= 0) {
    const next = [...views];
    next[index] = view;
    return next;
  }
  if (views.length >= SAVED_VIEW_LIMIT) return views;
  return [...views, view];
}

export function canSaveAnotherView(views: readonly SavedView[]): boolean {
  return views.length < SAVED_VIEW_LIMIT;
}

export function removeSavedView(views: SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}

export function findSavedView(views: readonly SavedView[], id: string | null): SavedView | null {
  if (!id) return null;
  return views.find((view) => view.id === id) ?? null;
}

/**
 * A label that is not already taken, so "Active work" saved twice reads as
 * "Active work 2" rather than two identical rows.
 */
export function uniqueSavedViewLabel(views: readonly SavedView[], label: string): string {
  const trimmed = normalizeSavedViewLabel(label);
  const taken = new Set(views.map((view) => view.label.toLocaleLowerCase()));
  if (!taken.has(trimmed.toLocaleLowerCase())) return trimmed;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${trimmed} ${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return trimmed;
}
