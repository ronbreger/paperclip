import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultIssueFilterState } from "./issue-filters";
import {
  SAVED_VIEW_LIMIT,
  SAVED_VIEW_PREFIX,
  canSaveAnotherView,
  STARTER_SAVED_VIEWS,
  findSavedView,
  isSavedViewKey,
  loadSavedViews,
  newSavedViewId,
  normalizeSavedView,
  normalizeSavedViews,
  parseSavedViewId,
  removeSavedView,
  saveSavedViews,
  savedViewKey,
  savedViewsStorageKey,
  uniqueSavedViewLabel,
  upsertSavedView,
  type SavedView,
} from "./saved-views";

function view(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: "v1",
    label: "My view",
    hint: "",
    filters: { ...defaultIssueFilterState },
    ...overrides,
  };
}

describe("saved view keys", () => {
  it("round-trips an id through the `saved:` key", () => {
    expect(savedViewKey("abc")).toBe(`${SAVED_VIEW_PREFIX}abc`);
    expect(parseSavedViewId(savedViewKey("abc"))).toBe("abc");
  });

  it("rejects built-in keys and a bare prefix", () => {
    expect(isSavedViewKey("mine")).toBe(false);
    expect(isSavedViewKey(SAVED_VIEW_PREFIX)).toBe(false);
    expect(parseSavedViewId("backlog")).toBeNull();
    expect(parseSavedViewId(null)).toBeNull();
  });

  it("mints ids that do not collide", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSavedViewId()));
    expect(ids.size).toBe(50);
  });
});

describe("saved view normalization", () => {
  it("drops entries with no id or no label", () => {
    expect(normalizeSavedView({ id: "", label: "x" })).toBeNull();
    expect(normalizeSavedView({ id: "x", label: "   " })).toBeNull();
    expect(normalizeSavedView("nope")).toBeNull();
  });

  it("fills missing filter keys from the default state", () => {
    const normalized = normalizeSavedView({ id: "v", label: "V", filters: { statuses: ["todo"] } });
    expect(normalized?.filters).toEqual({ ...defaultIssueFilterState, statuses: ["todo"] });
  });

  it("keeps the first of two entries sharing an id", () => {
    const views = normalizeSavedViews([
      { id: "v", label: "First" },
      { id: "v", label: "Second" },
    ]);
    expect(views.map((entry) => entry.label)).toEqual(["First"]);
  });
});

describe("saved view persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("seeds the starter views on a device that has never saved one", () => {
    expect(loadSavedViews("c1").map((entry) => entry.id))
      .toEqual(STARTER_SAVED_VIEWS.map((entry) => entry.id));
  });

  it("does not resurrect the starters after the user deletes everything", () => {
    saveSavedViews("c1", []);
    expect(loadSavedViews("c1")).toEqual([]);
  });

  it("scopes storage per organization", () => {
    saveSavedViews("c1", [view({ id: "a", label: "A" })]);
    expect(savedViewsStorageKey("c1")).not.toBe(savedViewsStorageKey("c2"));
    expect(loadSavedViews("c1").map((entry) => entry.id)).toEqual(["a"]);
    expect(loadSavedViews("c2").map((entry) => entry.id))
      .toEqual(STARTER_SAVED_VIEWS.map((entry) => entry.id));
  });

  it("falls back to the starters when the stored value is unreadable", () => {
    localStorage.setItem(savedViewsStorageKey("c1"), "{not json");
    expect(loadSavedViews("c1").map((entry) => entry.id))
      .toEqual(STARTER_SAVED_VIEWS.map((entry) => entry.id));
  });

  it("round-trips a saved filter set", () => {
    const saved = view({ id: "a", filters: { ...defaultIssueFilterState, projects: ["p1"], statuses: ["backlog"] } });
    saveSavedViews("c1", [saved]);
    expect(loadSavedViews("c1")[0].filters.projects).toEqual(["p1"]);
    expect(loadSavedViews("c1")[0].filters.statuses).toEqual(["backlog"]);
  });
});

describe("saved view list edits", () => {
  it("appends a new view and replaces one with the same id", () => {
    const first = view({ id: "a", label: "A" });
    const list = upsertSavedView([], first);
    expect(list).toHaveLength(1);
    const replaced = upsertSavedView(list, view({ id: "a", label: "A renamed" }));
    expect(replaced).toHaveLength(1);
    expect(replaced[0].label).toBe("A renamed");
  });

  it("removes by id and finds by id", () => {
    const list = [view({ id: "a" }), view({ id: "b" })];
    expect(removeSavedView(list, "a").map((entry) => entry.id)).toEqual(["b"]);
    expect(findSavedView(list, "b")?.id).toBe("b");
    expect(findSavedView(list, "missing")).toBeNull();
    expect(findSavedView(list, null)).toBeNull();
  });

  it("refuses to grow past the view limit", () => {
    const full = Array.from({ length: SAVED_VIEW_LIMIT }, (_, index) =>
      view({ id: `v${index}`, label: `View ${index}` }));
    expect(canSaveAnotherView(full)).toBe(false);
    expect(upsertSavedView(full, view({ id: "extra", label: "Extra" }))).toHaveLength(SAVED_VIEW_LIMIT);
    // Replacing one of the existing views still works at the limit.
    expect(upsertSavedView(full, view({ id: "v0", label: "Renamed" }))[0].label).toBe("Renamed");
  });

  it("suffixes a label that is already taken", () => {
    const list = [view({ id: "a", label: "Active work" })];
    expect(uniqueSavedViewLabel(list, "Active work")).toBe("Active work 2");
    expect(uniqueSavedViewLabel(list, "Review")).toBe("Review");
  });
});

describe("storage failure is reported, not swallowed", () => {
  const realStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: realStorage });
  });

  it("returns false when the write is refused so the caller can keep the old list", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error("QuotaExceededError"); },
        removeItem: () => {},
        clear: () => {},
      },
    });
    expect(saveSavedViews("c1", [view()])).toBe(false);
  });

  it("returns true on a write that lands", () => {
    expect(saveSavedViews("c1", [view()])).toBe(true);
  });
});
