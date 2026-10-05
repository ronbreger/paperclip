// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskViewsMenu, formatTaskViewCount } from "./TaskViewsMenu";
import { defaultIssueFilterState } from "@/lib/issue-filters";
import { savedViewKey, type SavedView } from "@/lib/saved-views";

// Tell React this environment uses act() for event flushing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

const savedViews: SavedView[] = [
  {
    id: "workbench",
    label: "Workbench",
    hint: "Parked ideas",
    filters: { ...defaultIssueFilterState, statuses: ["backlog"] },
  },
];

describe("formatTaskViewCount", () => {
  it("hides a zero and marks a count the server has not finished paging", () => {
    expect(formatTaskViewCount(undefined)).toBeNull();
    expect(formatTaskViewCount({ value: 0 })).toBeNull();
    expect(formatTaskViewCount({ value: 7 })).toBe("7");
    expect(formatTaskViewCount({ value: 7, partial: true })).toBe("7+");
    expect(formatTaskViewCount({ value: 4000 })).toBe("999+");
  });
});

describe("TaskViewsMenu trigger", () => {
  it("names the active built-in view", () => {
    flushSync(() => root.render(<TaskViewsMenu value="backlog" onChange={() => {}} />));
    expect(container.textContent).toContain("Backlog");
  });

  it("names the active saved view, so the toolbar reads the same for both kinds", () => {
    flushSync(() => root.render(
      <TaskViewsMenu value={savedViewKey("workbench")} onChange={() => {}} savedViews={savedViews} />,
    ));
    const trigger = container.querySelector("button");
    expect(trigger?.textContent).toContain("Workbench");
    expect(trigger?.getAttribute("aria-label")).toBe("Change view — currently Workbench");
  });

  it("falls back to the default view rather than crashing on a deleted saved view", () => {
    flushSync(() => root.render(
      <TaskViewsMenu value={savedViewKey("gone")} onChange={() => {}} savedViews={savedViews} />,
    ));
    expect(container.querySelector("button")?.textContent).toContain("Mine");
  });
});
