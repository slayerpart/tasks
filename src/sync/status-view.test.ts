import { describe, expect, it } from "vitest";
import { statusView } from "./status-view.ts";

const ada = { id: "user-ada", email: "ada@example.com" };
const grace = { id: "user-grace", email: "grace@example.com", name: "Grace" };

describe("statusView", () => {
  it("shows no bar on a device that never synced", () => {
    expect(statusView({ kind: "signInRequired", pending: 4 }, null, 0)).toBeNull();
    expect(statusView({ kind: "offline", pending: 4, since: 0 }, null, 10_000)).toBeNull();
  });

  it("counts the changes that a sync sends, and stays calm when it sends none", () => {
    expect(statusView({ kind: "syncing", pending: 1 }, ada, 0)?.text).toBe("Syncing 1 change");
    expect(statusView({ kind: "syncing", pending: 0 }, ada, 0)?.text).toBe("Synced");
  });

  it("tells about a lost connection only after it lasts", () => {
    const offline = { kind: "offline", pending: 3, since: 1000 } as const;

    expect(statusView(offline, ada, 3000)?.text).toBe("Syncing 3 changes");
    expect(statusView(offline, ada, 3500)).toEqual({
      text: "Offline. 3 changes wait.",
      action: null,
      attention: false,
    });
  });

  it("offers a recovery action for each state that needs the user", () => {
    const now = 0;
    expect(statusView({ kind: "signInRequired", pending: 2 }, ada, now)?.action).toBe("signIn");
    expect(
      statusView({ kind: "error", pending: 0, message: "x", retryAt: 0 }, ada, now)?.action,
    ).toBe("retry");
    expect(statusView({ kind: "updateRequired" }, ada, now)?.action).toBe("reload");
    expect(statusView({ kind: "accountMismatch", user: grace }, ada, now)).toEqual({
      text: "This device holds the data of another account.",
      action: "resolve",
      attention: true,
    });
  });
});
