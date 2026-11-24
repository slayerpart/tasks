import { describe, expect, it } from "vitest";
import type { DisplayList } from "../../model/selectors.ts";
import type { IsoTimestamp, ListId, OrderKey } from "../../model/types.ts";
import { switcherOptions, type SwitcherOption } from "./switcher-options.ts";

function lists(...titles: string[]): DisplayList[] {
  const time = "2026-11-24T00:00:00.000Z" as IsoTimestamp;
  return titles.map((title, index) => ({
    list: {
      id: `list-${String(index)}` as ListId,
      title,
      order: String(index) as OrderKey,
      createdAt: time,
      updatedAt: time,
      deletedAt: null,
    },
    heat: 0,
    openCount: 0,
  }));
}

function labels(options: readonly SwitcherOption[]): string[] {
  return options.map((option) =>
    option.kind === "list" ? option.item.list.title : `create: ${option.title}`,
  );
}

describe("switcherOptions", () => {
  const all = lists("Groceries", "Work", "Gifts", "Homework");

  it("shows all lists in their order for an empty search", () => {
    expect(labels(switcherOptions(all, ""))).toEqual(["Groceries", "Work", "Gifts", "Homework"]);
    expect(labels(switcherOptions(all, "   "))).toEqual(["Groceries", "Work", "Gifts", "Homework"]);
  });

  it("finds the text anywhere in a title, in any case, and offers a new list", () => {
    expect(labels(switcherOptions(all, " ORK"))).toEqual(["Work", "Homework", "create: ORK"]);
  });

  it("offers no new list when a title is the same as the search", () => {
    expect(labels(switcherOptions(all, "gifts "))).toEqual(["Gifts"]);
    expect(labels(switcherOptions(all, "WORK"))).toEqual(["Work", "Homework"]);
  });

  it("offers only a new list when no title matches", () => {
    expect(labels(switcherOptions(all, "  Trip to Rome "))).toEqual(["create: Trip to Rome"]);
  });

  it("has no options without lists and without a search", () => {
    expect(switcherOptions([], "")).toEqual([]);
  });
});
