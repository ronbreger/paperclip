// @vitest-environment node

import { describe, expect, it } from "vitest";
import { STARTER_SAVED_VIEWS } from "./saved-views";

/**
 * BREGER-LOCAL — do not upstream.
 *
 * Pins the four views this instance expects out of the box. The upstream
 * branch has three and no project id, so this file failing on an upstream
 * merge is the intended signal, not a bug.
 */
describe("Breger starter views", () => {
  it("supplies all four views, in menu order", () => {
    expect(STARTER_SAVED_VIEWS.map((view) => view.label))
      .toEqual(["Workbench", "Needs Ron", "Active work", "Review"]);
  });

  it("points Workbench at the Workbench project, parked only", () => {
    const workbench = STARTER_SAVED_VIEWS.find((view) => view.id === "workbench");
    expect(workbench?.filters.projects).toEqual(["90d611f9-b079-45ff-9294-036093b61942"]);
    expect(workbench?.filters.statuses).toEqual(["backlog"]);
  });

  it("drives Needs Ron from the attention filter, not from a status", () => {
    const needsRon = STARTER_SAVED_VIEWS.find((view) => view.id === "needs-ron");
    expect(needsRon?.filters.attention).toEqual(["needs_me"]);
    expect(needsRon?.filters.statuses).toEqual([]);
  });
});
