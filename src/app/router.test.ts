import { afterEach, describe, expect, it } from "vitest";

async function back(): Promise<void> {
  const popped = new Promise((resolve) => {
    window.addEventListener("popstate", resolve, { once: true });
  });
  window.history.back();
  await popped;
}
import type { ListId } from "../model/types.ts";
import { parseRoute, rememberRoute, routePath, startRouting } from "./router.ts";

const listId = "a1b2-c3" as ListId;

describe("routes", () => {
  it("gives each screen a path and reads it back", () => {
    for (const route of [
      { screen: "lists" },
      { screen: "list", listId },
      { screen: "list", listId: "with space/and slash" as ListId },
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
});
