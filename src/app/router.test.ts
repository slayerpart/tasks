import { afterEach, describe, expect, it } from "vitest";

async function back(): Promise<void> {
  const popped = new Promise((resolve) => {
    window.addEventListener("popstate", resolve, { once: true });
  });
  window.history.back();
  await popped;
}
import type { ListId } from "../model/types.ts";
import {
  openList,
  openSettings,
  parseRoute,
  rememberRoute,
  routePath,
  startRouting,
  switchList,
} from "./router.ts";

const listId = "a1b2-c3" as ListId;

describe("routes", () => {
  it("gives each screen a path and reads it back", () => {
    for (const route of [
      { screen: "lists" },
      { screen: "list", listId },
      { screen: "list", listId: "with space/and slash" as ListId },
      { screen: "settings" },
    ] as const) {
      expect(parseRoute(routePath(route))).toEqual(route);
    }
  });

  it("does not know other paths", () => {
    for (const path of ["/lists", "/lists/", "/lists/a/b", "/lists/%E0", "/other"]) {
      expect(parseRoute(path)).toBeNull();
    }
  });
});

describe("startRouting", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
  });

  it("opens the lists screen on a new device", () => {
    startRouting();

    expect(window.location.pathname).toBe("/");
  });

  it("opens the screen that the user left last, with the lists screen below it", async () => {
    rememberRoute({ screen: "list", listId });
    // The page that the user came from, before the app.
    window.history.replaceState(null, "", "/outside");
    window.history.pushState(null, "", "/");

    startRouting();

    expect(window.location.pathname).toBe("/lists/a1b2-c3");
    await back();
    expect(window.location.pathname).toBe("/");
  });

  it("puts the lists screen below a list that opens from its URL", async () => {
    window.history.replaceState(null, "", "/outside");
    window.history.pushState(null, "", "/lists/a1b2-c3");

    startRouting();

    expect(window.location.pathname).toBe("/lists/a1b2-c3");
    await back();
    expect(window.location.pathname).toBe("/");
  });

  it("puts the lists screen below the settings, and keeps the query of a sign-in", async () => {
    window.history.replaceState(null, "", "/outside");
    window.history.pushState(null, "", "/settings?error=access_denied");

    startRouting();

    expect(window.location.pathname + window.location.search).toBe("/settings?error=access_denied");
    await back();
    expect(window.location.pathname).toBe("/");
  });
});

describe("openSettings", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("opens the settings above the lists screen, so back goes to the lists screen", async () => {
    openSettings();

    expect(window.location.pathname).toBe("/settings");
    await back();
    expect(window.location.pathname).toBe("/");
  });

  it("takes the place of a list, so back still goes to the lists screen", async () => {
    openList(listId);
    const length = window.history.length;

    openSettings();

    expect(window.location.pathname).toBe("/settings");
    expect(window.history.length).toBe(length);
    await back();
    expect(window.location.pathname).toBe("/");
  });
});

describe("switchList", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("shows the new list in place of the old one, so back still goes to the lists screen", async () => {
    window.history.replaceState(null, "", "/");
    openList(listId);
    const length = window.history.length;

    switchList("other" as ListId);

    expect(window.location.pathname).toBe("/lists/other");
    expect(window.history.length).toBe(length);
    await back();
    expect(window.location.pathname).toBe("/");
  });

  it("opens the list above the lists screen", async () => {
    window.history.replaceState(null, "", "/");

    switchList(listId);

    expect(window.location.pathname).toBe("/lists/a1b2-c3");
    await back();
    expect(window.location.pathname).toBe("/");
  });
});
