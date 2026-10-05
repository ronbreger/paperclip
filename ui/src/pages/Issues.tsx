import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "@/lib/router";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { collectLiveIssueIds } from "../lib/liveIssueIds";
import { usePublishSharedQueryData, useSharedPollingQuery } from "@/hooks/useSharedPolling";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { TaskViewsMenu, type TaskViewCount } from "../components/TaskViewsMenu";
import { SaveTaskViewDialog } from "../components/SaveTaskViewDialog";
import { Button } from "@/components/ui/button";
import { CircleDot, Plus } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { useStreamlinedUiEnabled } from "../hooks/useStreamlinedUiEnabled";
import { useCombinedInboxTasksEnabled } from "../hooks/useCombinedInboxTasksEnabled";
import { useDialogActions } from "../context/DialogContext";
import { useToastActions } from "../context/ToastContext";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Inbox } from "./Inbox";
import {
  ORGANIZATION_SCOPED_PARAMS,
  TASK_VIEW_PARAM,
  loadLastTaskView,
  normalizeTaskViewKey,
  resolveInitialTaskView,
  saveLastTaskView,
  taskView,
  taskViewGroups,
  type TaskViewKey,
} from "../lib/task-views";
import {
  SAVED_VIEW_LIMIT,
  canSaveAnotherView,
  loadSavedViews,
  newSavedViewId,
  removeSavedView,
  saveSavedViews,
  savedViewKey,
  uniqueSavedViewLabel,
  upsertSavedView,
  type SavedView,
} from "../lib/saved-views";
import {
  defaultIssueFilterState,
  type IssueFilterState,
} from "../lib/issue-filters";
import { describeIssueFilters } from "../lib/issue-filter-summary";
import { useAttentionIssueIds } from "../hooks/useAttentionIssueIds";

const WORKSPACE_FILTER_ISSUE_LIMIT = 1000;
const ISSUES_PAGE_SIZE = 100;
export const ISSUES_ROW_PRESENTATION = "task" as const;
export const ISSUES_TOOLBAR_PRESENTATION = "collection" as const;

export function resolveIssuesPresentation(streamlinedUiEnabled: boolean) {
  return streamlinedUiEnabled
    ? { rowPresentation: ISSUES_ROW_PRESENTATION, toolbarPresentation: ISSUES_TOOLBAR_PRESENTATION }
    : { rowPresentation: "legacy" as const, toolbarPresentation: "legacy" as const };
}

export function getNextIssuesPageOffset(
  loadedPageSize: number,
  currentOffset: number,
  pageSize: number = ISSUES_PAGE_SIZE,
): number | undefined {
  return loadedPageSize >= pageSize ? currentOffset + pageSize : undefined;
}

export function mergeIssuePagesStable<T extends { id: string }>(pages: T[][]): T[] {
  const seenIssueIds = new Set<string>();
  const merged: T[] = [];

  for (const page of pages) {
    for (const issue of page) {
      if (seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);
      merged.push(issue);
    }
  }

  return merged;
}

export function buildIssuesSearchUrl(currentHref: string, search: string): string | null {
  const url = new URL(currentHref);
  const currentSearch = url.searchParams.get("q") ?? "";
  if (currentSearch === search) return null;

  if (search.length > 0) {
    url.searchParams.set("q", search);
  } else {
    url.searchParams.delete("q");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Tasks — the single task surface after PAP-670 merged Inbox into it.
 *
 * This component only resolves `?view=` to a view and hands off: My-work views
 * render the inbox list, organization views render the task collection. Both
 * get the same Views control in their toolbar, so the switch reads as one page.
 */
export function Issues() {
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const { enabled: combinedInboxTasksEnabled } = useCombinedInboxTasksEnabled();
  // The merged surface is Combined Inbox + Task List only. With the flag off, and always in
  // the legacy shell, Tasks is the plain task list and Inbox keeps its pages.
  return streamlinedUiEnabled && combinedInboxTasksEnabled ? <StreamlinedTasks /> : <OrganizationIssues />;
}

function StreamlinedTasks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialogActions();
  const { pushToast } = useToastActions();
  const inboxBadge = useInboxBadge(selectedCompanyId);

  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews(selectedCompanyId));
  // Saved views are per organization, so switching organizations swaps the list.
  useEffect(() => {
    setSavedViews(loadSavedViews(selectedCompanyId));
  }, [selectedCompanyId]);
  // Storage can refuse the write (private browsing, a full quota). When it
  // does, keep the list as it was and say so, rather than showing a view that
  // disappears on the next reload.
  const persistSavedViews = useCallback((next: SavedView[]): boolean => {
    if (!saveSavedViews(selectedCompanyId, next)) {
      pushToast({
        title: "Could not save the view",
        body: "Browser storage is unavailable or full.",
        tone: "error",
      });
      return false;
    }
    setSavedViews(next);
    return true;
  }, [pushToast, selectedCompanyId]);

  const requestedView = searchParams.get(TASK_VIEW_PARAM);
  const hasOrganizationScopedParam = ORGANIZATION_SCOPED_PARAMS.some(
    (param) => (searchParams.get(param) ?? "").length > 0,
  );
  // Read the stored view once per mount so a later write can't yank the view
  // out from under the user mid-session.
  const [lastUsedView] = useState<TaskViewKey>(() => loadLastTaskView(loadSavedViews(selectedCompanyId)));
  const view = resolveInitialTaskView(requestedView, hasOrganizationScopedParam, lastUsedView, savedViews);
  const definition = taskView(view, savedViews);

  // Counting every view needs the loaded tasks, which only the task list has;
  // it reports them back through `onFilterSetCounts`.
  const countFilterSets = useMemo(() => {
    const sets: Record<string, IssueFilterState> = {};
    for (const group of taskViewGroups(savedViews)) {
      for (const groupView of group.views) {
        if (groupView.surface !== "issues") continue;
        sets[groupView.key] = groupView.filters
          ?? { ...defaultIssueFilterState, statuses: groupView.statuses ?? [] };
      }
    }
    return sets;
  }, [savedViews]);
  const [viewCounts, setViewCounts] = useState<Record<string, TaskViewCount>>({});
  const handleFilterSetCounts = useCallback((counts: Record<string, number>, partial: boolean) => {
    setViewCounts(Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, { value, partial }]),
    ));
  }, []);

  // The attention feed only loads when a view on screen actually filters on it.
  const needsAttentionFeed = Object.values(countFilterSets).some((set) => set.attention.length > 0);
  const attention = useAttentionIssueIds(selectedCompanyId, needsAttentionFeed);

  const [currentFilters, setCurrentFilters] = useState<IssueFilterState>(defaultIssueFilterState);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const filterSummary = useMemo(() => describeIssueFilters(currentFilters), [currentFilters]);
  const suggestedLabel = useMemo(
    () => uniqueSavedViewLabel(savedViews, filterSummary.slice(0, 40)),
    [savedViews, filterSummary],
  );
  const handleSaveView = useCallback((label: string) => {
    if (!canSaveAnotherView(savedViews)) {
      pushToast({
        title: "View limit reached",
        body: `Delete a saved view first. The limit is ${SAVED_VIEW_LIMIT}.`,
        tone: "error",
      });
      return;
    }
    const saved: SavedView = {
      id: newSavedViewId(),
      label,
      hint: describeIssueFilters(currentFilters),
      filters: currentFilters,
    };
    if (!persistSavedViews(upsertSavedView(savedViews, saved))) return;
    saveLastTaskView(savedViewKey(saved.id));
    navigate(`/issues?${TASK_VIEW_PARAM}=${savedViewKey(saved.id)}`);
  }, [currentFilters, navigate, persistSavedViews, pushToast, savedViews]);
  const handleDeleteSavedView = useCallback((savedViewId: string) => {
    if (!persistSavedViews(removeSavedView(savedViews, savedViewId))) return;
    if (view === savedViewKey(savedViewId)) navigate(`/issues?${TASK_VIEW_PARAM}=all`);
  }, [navigate, persistSavedViews, savedViews, view]);

  // Make the resolved view addressable without dropping the params that
  // brought the user here — and correct a requested view that was overridden
  // (an inbox view carrying an organization filter opens All tasks).
  useEffect(() => {
    if (normalizeTaskViewKey(requestedView, savedViews) === view) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set(TASK_VIEW_PARAM, view);
      return next;
    }, { replace: true });
  }, [requestedView, savedViews, view, setSearchParams]);

  const selectView = useCallback((next: TaskViewKey) => {
    saveLastTaskView(next);
    // A view switch starts clean: the previous view's search and filters are
    // its own, not the new view's.
    navigate(`/issues?${TASK_VIEW_PARAM}=${next}`);
  }, [navigate]);

  const viewsMenu = (
    <TaskViewsMenu
      value={view}
      onChange={selectView}
      badgeCount={inboxBadge.inbox}
      savedViews={savedViews}
      counts={viewCounts}
      // Saving ad-hoc filters only makes sense where filters exist; the inbox
      // surface has its own controls, so it gets the menu without the action.
      onSaveCurrentView={definition.surface === "issues" ? () => setSaveDialogOpen(true) : undefined}
      onDeleteSavedView={handleDeleteSavedView}
    />
  );

  if (definition.surface === "inbox") {
    return (
      <Inbox
        tab={definition.inboxTab}
        surfaceLabel="Tasks"
        toolbarContext={(
          <div className="flex min-w-0 items-center gap-2">
            {viewsMenu}
            <Button size="sm" variant="outline" aria-label="New Task" onClick={() => openNewIssue()}>
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">New Task</span>
            </Button>
          </div>
        )}
      />
    );
  }

  return (
    <>
      <OrganizationIssues
        toolbarContext={viewsMenu}
        initialStatuses={definition.filters ? undefined : definition.statuses}
        initialFilters={definition.filters}
        attentionIssueIds={attention.byToken}
        attentionIssueIdsReady={attention.ready}
        countFilterSets={countFilterSets}
        onFilterSetCounts={handleFilterSetCounts}
        onFiltersChange={setCurrentFilters}
      />
      <SaveTaskViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        suggestedLabel={suggestedLabel}
        summary={filterSummary}
        onSave={handleSaveView}
      />
    </>
  );
}

function OrganizationIssues({
  toolbarContext,
  initialStatuses,
  initialFilters,
  attentionIssueIds,
  attentionIssueIdsReady,
  countFilterSets,
  onFilterSetCounts,
  onFiltersChange,
}: {
  toolbarContext?: ReactNode;
  initialStatuses?: string[];
  initialFilters?: IssueFilterState;
  attentionIssueIds?: ReadonlyMap<string, ReadonlySet<string>>;
  attentionIssueIdsReady?: boolean;
  countFilterSets?: Readonly<Record<string, IssueFilterState>>;
  onFilterSetCounts?: (counts: Record<string, number>, partial: boolean) => void;
  onFiltersChange?: (filters: IssueFilterState) => void;
} = {}) {
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const issuesPresentation = resolveIssuesPresentation(streamlinedUiEnabled);
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fetchNextPageInFlightRef = useRef(false);

  const urlSearch = searchParams.get("q") ?? "";
  const [searchOverride, setSearchOverride] = useState<{ search: string; locationSearch: string } | null>(null);
  const syncedSearch = useMemo(() => {
    if (typeof window !== "undefined" && searchOverride?.locationSearch === window.location.search) {
      return searchOverride.search;
    }
    return urlSearch;
  }, [searchOverride, urlSearch, location.search]);
  const participantAgentId = searchParams.get("participantAgentId") ?? undefined;
  const initialWorkspaces = searchParams.getAll("workspace").filter((workspaceId) => workspaceId.length > 0);
  const workspaceIdFilter = initialWorkspaces.length === 1 ? initialWorkspaces[0] : undefined;
  const handleSearchChange = useCallback((search: string) => {
    const nextUrl = buildIssuesSearchUrl(window.location.href, search);
    if (!nextUrl) {
      setSearchOverride(null);
      return;
    }
    window.history.replaceState(window.history.state, "", nextUrl);
    setSearchOverride({ search, locationSearch: window.location.search });
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!, { includeArchived: true }),
    queryFn: () => projectsApi.list(selectedCompanyId!, { includeArchived: true }),
    enabled: !!selectedCompanyId,
  });

  const liveRunsQueryKey = queryKeys.liveRuns(selectedCompanyId!);
  const sharedLiveRuns = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "live-runs",
    queryKey: liveRunsQueryKey,
    enabled: !!selectedCompanyId,
    // Event-sourced via LiveUpdatesProvider (GitHub issue 9627); no interval poll needed.
    refetchInterval: false,
    leaderOnly: true,
  });
  const { data: liveRuns, dataUpdatedAt: liveRunsUpdatedAt } = useQuery({
    queryKey: liveRunsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: sharedLiveRuns.enabled,
    refetchInterval: sharedLiveRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedLiveRuns, liveRuns, liveRunsUpdatedAt);

  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Tasks",
        `${location.pathname}${location.search}${location.hash}`,
        "issues",
      ),
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Tasks" }]);
  }, [setBreadcrumbs]);

  const issuePageSize = workspaceIdFilter ? WORKSPACE_FILTER_ISSUE_LIMIT : ISSUES_PAGE_SIZE;

  const {
    data: issuePages,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [
      ...queryKeys.issues.list(selectedCompanyId!),
      "participant-agent",
      participantAgentId ?? "__all__",
      "workspace",
      workspaceIdFilter ?? "__all__",
      "compact",
      "with-routine-executions",
      "infinite",
      issuePageSize,
    ],
    queryFn: ({ pageParam, signal }) => issuesApi.listCompact(selectedCompanyId!, {
      participantAgentId,
      workspaceId: workspaceIdFilter,
      includeRoutineExecutions: true,
      limit: issuePageSize,
      offset: pageParam,
      sortField: "updated",
      sortDir: "desc",
    }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      getNextIssuesPageOffset(lastPage.length, lastPageParam, issuePageSize),
    enabled: !!selectedCompanyId,
    placeholderData: (previousData) => previousData,
  });

  const issues = useMemo(() => mergeIssuePagesStable(issuePages?.pages ?? []) as Issue[], [issuePages]);
  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns, issues), [issues, liveRuns]);
  const hasMoreServerIssues = syncedSearch.trim().length === 0
    && hasNextPage === true;
  const loadMoreServerIssues = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || fetchNextPageInFlightRef.current) return;
    fetchNextPageInFlightRef.current = true;
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      fetchNextPageInFlightRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={CircleDot}
        message={streamlinedUiEnabled
          ? "Select an organization to view tasks."
          : "Select a company to view tasks."}
      />
    );
  }

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      isLoadingMoreIssues={isFetchingNextPage}
      error={error as Error | null}
      agents={agents}
      projects={projects}
      liveIssueIds={liveIssueIds}
      viewStateKey="paperclip:issues-view"
      rowPresentation={issuesPresentation.rowPresentation}
      toolbarPresentation={issuesPresentation.toolbarPresentation}
      issueLinkState={issueLinkState}
      initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
      initialWorkspaces={initialWorkspaces.length > 0 ? initialWorkspaces : undefined}
      initialStatuses={initialStatuses}
      initialFilters={initialFilters}
      attentionIssueIds={attentionIssueIds}
      attentionIssueIdsReady={attentionIssueIdsReady}
      countFilterSets={countFilterSets}
      onFilterSetCounts={onFilterSetCounts}
      onFiltersChange={onFiltersChange}
      toolbarContext={toolbarContext}
      initialSearch={syncedSearch}
      onSearchChange={handleSearchChange}
      enableRoutineVisibilityFilter
      hasMoreIssues={hasMoreServerIssues}
      onLoadMoreIssues={loadMoreServerIssues}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      searchFilters={participantAgentId || workspaceIdFilter ? { participantAgentId, workspaceId: workspaceIdFilter } : undefined}
    />
  );
}
