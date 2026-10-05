import { describe, expect, it } from "vitest";
import {
  ATTENTION_BADGE_SOURCE_KINDS,
  attentionItemNeedsPerson,
  countAttentionBadgeItems,
} from "./attention-badge.js";
import { ATTENTION_SOURCE_KINDS } from "./types/attention.js";
import type { AttentionItem, AttentionSourceKind } from "./types/attention.js";

const NOW = Date.parse("2026-10-05T21:00:00.000Z");
const HOUR = 60 * 60 * 1_000;

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "item-1",
    companyId: "company-1",
    sourceKind: "issue_thread_interaction",
    subject: {
      kind: "interaction",
      id: "interaction-1",
      companyId: "company-1",
      title: "Deploy the press site now or after QA?",
      identifier: "BRE-34",
      status: "in_progress",
      href: "/bre/issues/BRE-34",
    },
    whyNow: "Waiting on an answer.",
    decisionVerbs: [],
    inlineResolvable: true,
    entryRule: "interaction.status = 'pending'",
    exitRule: "Answered or withdrawn.",
    dedupKey: "interaction:interaction-1",
    dismissalKey: "interaction:interaction-1",
    dismissal: null,
    severity: "medium",
    rank: 1,
    activityAt: "2026-10-05T20:00:00.000Z",
    createdAt: "2026-10-05T20:00:00.000Z",
    updatedAt: "2026-10-05T20:00:00.000Z",
    relatedIssue: null,
    project: null,
    workspace: null,
    expiresAt: null,
    ruleKey: null,
    originAgentName: "Atlas",
    queues: [],
    shelf: false,
    retentionDays: 30,
    keep: false,
    archivedAt: null,
    retentionVersion: 1,
    decideBy: null,
    decideByAttribution: null,
    snoozedUntil: null,
    detail: null,
    trainingExampleId: null,
    ...overrides,
  };
}

describe("attentionItemNeedsPerson — what counts", () => {
  it("counts an open interaction card that is waiting for an answer", () => {
    expect(attentionItemNeedsPerson(item(), NOW)).toBe(true);
  });

  it.each(ATTENTION_BADGE_SOURCE_KINDS)("counts a %s, because it is a request", (sourceKind) => {
    expect(attentionItemNeedsPerson(item({ sourceKind }), NOW)).toBe(true);
  });

  it("counts an item that arrived days ago, because the badge has no clock", () => {
    // The old rule only counted items that surfaced on the current UTC day, so
    // an unanswered question silently left the badge at UTC midnight and the
    // badge went to zero while the work was still blocked.
    const old = item({
      createdAt: "2026-09-28T04:00:00.000Z",
      activityAt: "2026-09-28T04:00:00.000Z",
    });
    expect(attentionItemNeedsPerson(old, NOW)).toBe(true);
  });

  it("counts an item with no decide-by deadline", () => {
    expect(attentionItemNeedsPerson(item({ decideBy: null }), NOW)).toBe(true);
  });
});

describe("attentionItemNeedsPerson — what does not count", () => {
  const statusKinds = ATTENTION_SOURCE_KINDS.filter(
    (kind): kind is AttentionSourceKind =>
      !(ATTENTION_BADGE_SOURCE_KINDS as readonly string[]).includes(kind),
  );

  it.each(statusKinds)("does not count a %s, because it is status, not a request", (sourceKind) => {
    expect(attentionItemNeedsPerson(item({ sourceKind }), NOW)).toBe(false);
  });

  it("does not count a failed run an agent is already retrying", () => {
    expect(attentionItemNeedsPerson(item({ sourceKind: "failed_run" }), NOW)).toBe(false);
  });

  it.each(["done", "cancelled"])("does not count a card whose subject is %s", (status) => {
    const closed = item({ subject: { ...item().subject, status } });
    expect(attentionItemNeedsPerson(closed, NOW)).toBe(false);
  });

  it("does not count a card whose related task was closed under it", () => {
    const closed = item({
      relatedIssue: {
        kind: "issue",
        id: "issue-9",
        companyId: "company-1",
        title: "Ship the runbook",
        identifier: "BRE-8",
        status: "done",
        href: "/bre/issues/BRE-8",
      },
    });
    expect(attentionItemNeedsPerson(closed, NOW)).toBe(false);
  });

  it("does not count an expired card", () => {
    const expired = item({ expiresAt: new Date(NOW - HOUR).toISOString() });
    expect(attentionItemNeedsPerson(expired, NOW)).toBe(false);
  });

  it("counts a card whose expiry is still ahead", () => {
    const live = item({ expiresAt: new Date(NOW + HOUR).toISOString() });
    expect(attentionItemNeedsPerson(live, NOW)).toBe(true);
  });

  it("does not count a snoozed card until the snooze runs out", () => {
    const snoozed = item({ snoozedUntil: new Date(NOW + HOUR).toISOString() });
    expect(attentionItemNeedsPerson(snoozed, NOW)).toBe(false);
    expect(attentionItemNeedsPerson(snoozed, NOW + 2 * HOUR)).toBe(true);
  });

  it("does not count a dismissed card", () => {
    const dismissed = item({
      dismissal: {
        kind: "dismiss",
        dismissedAt: "2026-10-05T20:30:00.000Z",
        snoozedUntil: null,
        isActive: true,
      },
    });
    expect(attentionItemNeedsPerson(dismissed, NOW)).toBe(false);
  });

  it("counts a card whose dismissal has gone stale and is no longer active", () => {
    const restored = item({
      dismissal: {
        kind: "dismiss",
        dismissedAt: "2026-10-04T20:30:00.000Z",
        snoozedUntil: null,
        isActive: false,
      },
    });
    expect(attentionItemNeedsPerson(restored, NOW)).toBe(true);
  });

  it("does not count a stale card that has fallen past its retention shelf", () => {
    expect(attentionItemNeedsPerson(item({ shelf: true }), NOW)).toBe(false);
  });

  it("does not count an archived card", () => {
    const archived = item({ archivedAt: "2026-10-05T20:45:00.000Z" });
    expect(attentionItemNeedsPerson(archived, NOW)).toBe(false);
  });
});

describe("countAttentionBadgeItems", () => {
  it("counts only the items that are blocked on a person", () => {
    const items = [
      item({ id: "a" }),
      item({ id: "b", sourceKind: "approval" }),
      item({ id: "c", sourceKind: "failed_run" }),
      item({ id: "d", sourceKind: "budget_alert" }),
      item({ id: "e", sourceKind: "review" }),
      item({ id: "f", sourceKind: "recovery_action" }),
      item({ id: "g", sourceKind: "blocker_attention" }),
      item({ id: "h", subject: { ...item().subject, status: "done" } }),
      item({ id: "i", shelf: true }),
      item({ id: "j", expiresAt: new Date(NOW - HOUR).toISOString() }),
    ];
    expect(countAttentionBadgeItems(items, NOW)).toBe(2);
  });

  it("holds the trust invariant: the badge equals the rows the queue would show", () => {
    // Whenever the badge says N, opening the queue must show exactly N items,
    // each one waiting on a person. This is the check that catches regressions.
    const items = ATTENTION_SOURCE_KINDS.map((sourceKind, index) =>
      item({ id: `item-${index}`, sourceKind }),
    );
    const shown = items.filter((candidate) => attentionItemNeedsPerson(candidate, NOW));
    expect(countAttentionBadgeItems(items, NOW)).toBe(shown.length);
    expect(shown.length).toBe(ATTENTION_BADGE_SOURCE_KINDS.length);
  });

  it("is zero when nothing is open", () => {
    expect(countAttentionBadgeItems([], NOW)).toBe(0);
  });
});
