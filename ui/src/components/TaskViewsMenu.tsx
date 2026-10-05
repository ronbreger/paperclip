import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SAVED_VIEW_GROUP_LABEL, taskView, taskViewGroups, type TaskViewKey } from "@/lib/task-views";
import type { SavedView } from "@/lib/saved-views";
import { cn } from "@/lib/utils";

/** `undefined` renders no badge; a partial count renders as `12+`. */
export interface TaskViewCount {
  value: number;
  partial?: boolean;
}

export function formatTaskViewCount(count: TaskViewCount | undefined): string | null {
  if (!count || count.value <= 0) return null;
  if (count.value > 999) return "999+";
  return count.partial ? `${count.value}+` : String(count.value);
}

/**
 * The single control that replaced both the Inbox tab bar and the implicit
 * "all tasks" default on Tasks (PAP-670). One menu, grouped by scope, so the
 * nav does not have to grow a row every time a view is added.
 *
 * Views the user saved from their own filters land in a third group here
 * rather than in a separate control, so "my views" and "the built-in views"
 * are one list to scan — which matters most on a phone, where the menu is the
 * whole navigation.
 */
export function TaskViewsMenu({
  value,
  onChange,
  badgeCount,
  savedViews = [],
  counts,
  onSaveCurrentView,
  onDeleteSavedView,
}: {
  value: TaskViewKey;
  onChange: (next: TaskViewKey) => void;
  /** Unread count surfaced next to the My-work group, mirroring the nav badge. */
  badgeCount?: number;
  savedViews?: readonly SavedView[];
  /** Per-view row counts, keyed by view key. */
  counts?: Readonly<Record<string, TaskViewCount | undefined>>;
  /** Omitted where there are no ad-hoc filters to save (the inbox surface). */
  onSaveCurrentView?: () => void;
  onDeleteSavedView?: (savedViewId: string) => void;
}) {
  const active = taskView(value, savedViews);
  const groups = taskViewGroups(savedViews);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          aria-label={`Change view — currently ${active.label}`}
        >
          <span className="max-w-(--sz-160px) truncate font-medium">{active.label}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      {/* The saved group makes this menu unbounded, so it scrolls instead of
          running off the bottom of a phone screen. */}
      <DropdownMenuContent align="start" className="max-h-(--sz-70vh) w-(--sz-260px) overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span>{group.label}</span>
              {groupIndex === 0 && badgeCount != null && badgeCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-(length:--text-nano) leading-tight text-primary-foreground">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </DropdownMenuLabel>
            {group.views.map((view) => {
              const selected = view.key === value;
              const count = formatTaskViewCount(counts?.[view.key]);
              return (
                <DropdownMenuItem
                  key={view.key}
                  onSelect={() => onChange(view.key)}
                  className="items-start gap-2"
                  aria-current={selected ? "true" : undefined}
                >
                  <Check
                    aria-hidden="true"
                    className={cn("mt-0.5 size-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", selected && "font-medium")}>{view.label}</span>
                    {view.hint ? (
                      <span className="block text-(length:--text-nano) text-muted-foreground">{view.hint}</span>
                    ) : null}
                  </span>
                  {count ? (
                    <span
                      className="mt-0.5 shrink-0 text-(length:--text-nano) tabular-nums text-muted-foreground"
                      aria-label={`${count} tasks`}
                    >
                      {count}
                    </span>
                  ) : null}
                  {view.savedViewId && onDeleteSavedView ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete view ${view.label}`}
                      // Padded well past the glyph so the control is still
                      // reachable with a thumb, and negatively margined so it
                      // does not make the row taller.
                      className="-my-1 shrink-0 rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      // The menu item selects on click, and on a pointer-up
                      // whose pointer-down landed elsewhere. Both are stopped
                      // here, or a tap on the bin would also open the view.
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteSavedView(view.savedViewId!);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteSavedView(view.savedViewId!);
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
        {onSaveCurrentView ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSaveCurrentView()} className="gap-2">
              <Plus aria-hidden="true" className="size-3.5 shrink-0" />
              <span>Save current filters as a view</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { SAVED_VIEW_GROUP_LABEL };
