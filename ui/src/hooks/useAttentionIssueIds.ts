import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { attentionApi } from "@/api/attention";
import { queryKeys } from "@/lib/queryKeys";
import { ATTENTION_FILTER_NEEDS_ME } from "@/lib/issue-filters";
import { collectNeedsHumanIssueIds } from "@/lib/attention";

export interface AttentionIssueIds {
  /** Keyed by the token used in `IssueFilterState.attention`. */
  byToken: ReadonlyMap<string, ReadonlySet<string>>;
  /** False until the feed has answered; the filter shows nothing until then. */
  ready: boolean;
}

const EMPTY: AttentionIssueIds = { byToken: new Map(), ready: false };

/**
 * Backs the `attention` task-list filter with the Decisions feed.
 *
 * Only fetched when a view actually asks for it, so the ordinary task list
 * costs one request fewer than before. `all: true` returns the whole snapshot
 * in one response — the filter needs every match, not the first page, or a
 * count would be wrong the moment the queue is longer than a page.
 */
export function useAttentionIssueIds(
  companyId: string | null | undefined,
  enabled: boolean,
): AttentionIssueIds {
  const query = useQuery({
    queryKey: [...queryKeys.attention(companyId ?? "none"), "issue-ids"],
    queryFn: () => attentionApi.list(companyId!, { all: true }),
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });

  return useMemo(() => {
    if (!enabled) return EMPTY;
    if (!query.isSuccess) return { byToken: new Map(), ready: false };
    return {
      byToken: new Map([[ATTENTION_FILTER_NEEDS_ME, collectNeedsHumanIssueIds(query.data.items)]]),
      ready: true,
    };
  }, [enabled, query.isSuccess, query.data]);
}
