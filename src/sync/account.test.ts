import { describe, expect, it } from "vitest";
import { openAppStore } from "../app/store.ts";
import * as commands from "../model/commands.ts";
import { visibleLists } from "../model/selectors.ts";
import { createMemoryLocalStore } from "../test/memory-local-store.ts";
import { testContext } from "../test/random-steps.ts";
import { createAccount } from "./account.ts";
import type { AccountTransport, ServerResult } from "./http.ts";
import type { SyncEngine } from "./sync-engine.ts";

/** The account actions on a device with the first list in its outbox. */
async function setup(server: { answer: "ok" | "offline" | "noSession" } = { answer: "ok" }) {
  const local = createMemoryLocalStore();
  const store = await openAppStore(local, testContext("a"));
  const calls: string[] = [];
  const answer = <T>(name: string, value: T): Promise<ServerResult<T>> => {
    calls.push(name);
    switch (server.answer) {
      case "ok":
        return Promise.resolve({ kind: "ok", value });
      case "offline":
        return Promise.resolve({ kind: "offline" });
      case "noSession":
        return Promise.resolve({ kind: "signInRequired" });
    }
  };
  const transport: AccountTransport = {
    providers: () => answer("providers", ["mock"]),
    startSignIn: (provider, returnPath) =>
      answer("startSignIn", `https://provider.example/${provider}?back=${returnPath}`),
    signOut: () => answer("signOut", null),
    signOutEverywhere: () => answer("signOutEverywhere", null),
  };
  const engine: SyncEngine = {
    getStatus: () => ({ kind: "synced", at: 0 }),
    getUser: () => null,
    getAccount: () => null,
    subscribe: () => () => undefined,
    syncNow: () => {
      calls.push("sync");
      return Promise.resolve();
    },
    start: () => () => undefined,
    stop: () => {
      calls.push("stopSync");
      return Promise.resolve();
    },
  };
  const account = createAccount({
    transport,
    store,
    engine,
    restart: () => calls.push("restart"),
    navigate: (url) => calls.push(`navigate ${url}`),
  });
  const lists = async () => visibleLists(await local.load()).length;
  return { account, calls, lists, store };
}

describe("account", () => {
  it("goes to the provider to sign in", async () => {
    const { account, calls } = await setup();

    expect(await account.signIn("mock", "/settings")).toBeNull();
    expect(calls).toEqual(["startSignIn", "navigate https://provider.example/mock?back=/settings"]);
  });

  it("syncs before a sign-out, and counts the changes that the server does not have", async () => {
    const { account, calls } = await setup();

    expect(await account.flush()).toBe(1);
    expect(calls).toEqual(["sync"]);
  });

  it("signs out, deletes the data of the device and starts again", async () => {
    const { account, calls, lists } = await setup();

    expect(await account.signOut("device")).toBeNull();

    expect(calls).toEqual(["signOut", "stopSync", "restart"]);
    expect(await lists()).toBe(0);
  });

  it("signs out on all devices", async () => {
    const { account, calls } = await setup();

    await account.signOut("everywhere");

    expect(calls[0]).toBe("signOutEverywhere");
  });

  it("keeps the data when the server cannot end the session", async () => {
    const { account, calls, lists } = await setup({ answer: "offline" });

    expect(await account.signOut("device")).toEqual({ kind: "offline" });

    expect(calls).toEqual(["signOut"]);
    expect(await lists()).toBe(1);
  });

  it("deletes the data also when the session has ended already", async () => {
    const { account, lists } = await setup({ answer: "noSession" });

    expect(await account.signOut("device")).toBeNull();
    expect(await lists()).toBe(0);
  });

  it("takes no more changes once the data goes", async () => {
    const { account, store, lists } = await setup();

    await account.deleteDeviceData();
    store.dispatch(commands.createList(store.getSnapshot().state, testContext("b"), 0, "Late"));
    await store.idle();

    expect(await lists()).toBe(0);
  });

  it("ends the session for another account, and keeps the data of the device", async () => {
    const { account, calls, lists } = await setup();

    expect(await account.endSession()).toBeNull();

    expect(calls).toEqual(["signOut", "sync"]);
    expect(await lists()).toBe(1);
  });

  it("deletes the data of the device", async () => {
    const { account, calls, lists } = await setup();

    await account.deleteDeviceData();

    expect(calls).toEqual(["stopSync", "restart"]);
    expect(await lists()).toBe(0);
  });
});
