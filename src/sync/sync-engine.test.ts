import { describe, expect, it } from "vitest";
import { openAppStore, type AppStore } from "../app/store.ts";
import * as commands from "../model/commands.ts";
import { openTasks, visibleLists } from "../model/selectors.ts";
import type { State } from "../model/types.ts";
import { createMemoryLocalStore, type MemoryLocalStore } from "../test/memory-local-store.ts";
import { createMemorySyncServer, type MemorySyncServer } from "../test/memory-sync-server.ts";
import { testContext } from "../test/random-steps.ts";
import type { SessionUser, SyncTransport } from "./http.ts";
import type { UserId } from "./server-core.ts";
import { createSyncEngine, pushChunks, type Clock, type SyncEngine } from "./sync-engine.ts";

const ada: SessionUser = { id: "user-ada", email: "ada@example.com", name: "Ada" };
const grace: SessionUser = { id: "user-grace", email: "grace@example.com", name: "Grace" };

/** The network between the devices and the server. Tests switch it off and change the user. */
interface Network {
  online: boolean;
  updateRequired: boolean;
  pushes: number;
}

/** A transport to the server in memory. Requests and responses go through JSON. */
function transport(server: MemorySyncServer, network: Network, session: () => SessionUser | null) {
  const wire = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;
  return {
    session: () =>
      Promise.resolve(network.online ? { kind: "ok", value: session() } : { kind: "offline" }),
    async push(request) {
      if (!network.online) return { kind: "offline" };
      if (network.updateRequired) return { kind: "updateRequired" };
      const user = session();
      if (user === null) return { kind: "signInRequired" };
      network.pushes++;
      await server.push(user.id as UserId, wire(request));
      return { kind: "ok", value: null };
    },
    async pull(request) {
      if (!network.online) return { kind: "offline" };
      if (network.updateRequired) return { kind: "updateRequired" };
      const user = session();
      if (user === null) return { kind: "signInRequired" };
      const response = await server.pull(user.id as UserId, wire(request));
      if (response.kind !== "ok") return { kind: "updateRequired" };
      return { kind: "ok", value: wire(response) };
    },
  } as const satisfies SyncTransport;
}

/** A clock whose timers run only when the test moves the time. */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock & { advance(ms: number): void; delays(): number[] } = {
    now: () => now,
    setTimeout: (callback, ms) => {
      timers.set(nextId, { at: now + ms, callback });
      return nextId++;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    random: () => 0.5,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort(([, a], [, b]) => a.at - b.at)) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    delays: () => [...timers.values()].map((timer) => timer.at - now),
  };
  return clock;
}

interface Device {
  readonly store: AppStore;
  readonly local: MemoryLocalStore;
  readonly engine: SyncEngine;
  readonly clock: ReturnType<typeof manualClock>;
  user: SessionUser | null;
}

async function device(server: MemorySyncServer, network: Network, user: SessionUser | null) {
  const local = createMemoryLocalStore();
  const store = await openAppStore(local, testContext(crypto.randomUUID()));
  const clock = manualClock();
  const result: Device = {
    store,
    local,
    clock,
    user,
    engine: createSyncEngine({
      store,
      transport: transport(server, network, () => result.user),
      firstListTitle: "Tasks",
      clock,
    }),
  };
  return result;
}

function setup() {
  const server = createMemorySyncServer();
  const network: Network = { online: true, updateRequired: false, pushes: 0 };
  return { server, network, device: (user: SessionUser | null) => device(server, network, user) };
}

const listTitles = (state: State) => visibleLists(state).map((list) => list.title);

function firstListId(store: AppStore) {
  const list = visibleLists(store.getSnapshot().state)[0];
  if (list === undefined) throw new Error("Setup failed.");
  return list.id;
}

describe("sync engine", () => {
  it("asks to sign in, and counts the changes that wait", async () => {
    const { device: newDevice } = setup();
    const phone = await newDevice(null);

    await phone.engine.syncNow();

    expect(phone.engine.getStatus()).toEqual({ kind: "signInRequired", pending: 1 });
    expect(phone.engine.getUser()).toBeNull();
  });

  it("sends the lists of a new device to an empty account", async () => {
    const { server, device: newDevice } = setup();
    const phone = await newDevice(ada);

    await phone.engine.syncNow();

    expect(phone.engine.getStatus()).toEqual({ kind: "synced", at: 0 });
    expect(phone.engine.getUser()).toEqual(ada);
    expect(listTitles(server.stateOf(ada.id as UserId))).toEqual(["Tasks"]);
    expect(await phone.local.loadSync()).toMatchObject({ accountId: ada.id, outbox: [] });
  });

  it("drops the untouched first list of a new device when the account has lists", async () => {
    const { device: newDevice } = setup();
    const phone = await newDevice(ada);
    phone.store.dispatch(commands.renameList(testContext("p"), firstListId(phone.store), "Home"));
    await phone.engine.syncNow();

    const laptop = await newDevice(ada);
    await laptop.engine.syncNow();

    expect(listTitles(laptop.store.getSnapshot().state)).toEqual(["Home"]);
    expect(listTitles(await laptop.local.load())).toEqual(["Home"]);
  });

  it("merges the lists of a new device with changes into the account", async () => {
    const { server, device: newDevice } = setup();
    const phone = await newDevice(ada);
    await phone.engine.syncNow();
    const laptop = await newDevice(ada);
    const context = testContext("l");
    laptop.store.dispatch(
      commands.createList(laptop.store.getSnapshot().state, context, 1, "Work"),
    );

    await laptop.engine.syncNow();

    expect(listTitles(server.stateOf(ada.id as UserId)).sort()).toEqual(["Tasks", "Tasks", "Work"]);
    expect(listTitles(laptop.store.getSnapshot().state)).toHaveLength(3);
  });

  it("brings a change of one device to the other", async () => {
    const { device: newDevice } = setup();
    const phone = await newDevice(ada);
    await phone.engine.syncNow();
    const laptop = await newDevice(ada);
    await laptop.engine.syncNow();
    const listId = firstListId(phone.store);

    phone.store.dispatch(
      commands.createTask(phone.store.getSnapshot().state, testContext("p"), listId, 0, "Milk"),
    );
    await phone.engine.syncNow();
    await laptop.engine.syncNow();

    expect(openTasks(laptop.store.getSnapshot().state, listId).map((task) => task.title)).toEqual([
      "Milk",
    ]);
  });

  it("never sends the changes of one account to another", async () => {
    const { server, network, device: newDevice } = setup();
    const phone = await newDevice(ada);
    await phone.engine.syncNow();
    phone.store.dispatch(commands.renameList(testContext("p"), firstListId(phone.store), "Ada's"));
    await phone.store.idle();
    const pushes = network.pushes;

    phone.user = grace;
    await phone.engine.syncNow();

    expect(phone.engine.getStatus()).toEqual({ kind: "accountMismatch", user: grace });
    expect(network.pushes).toBe(pushes);
    expect(listTitles(server.stateOf(grace.id as UserId))).toEqual([]);
    expect(listTitles(phone.store.getSnapshot().state)).toEqual(["Ada's"]);
  });

  it("goes offline, retries with growing delays, and recovers", async () => {
    const { server, network, device: newDevice } = setup();
    const phone = await newDevice(ada);
    network.online = false;

    await phone.engine.syncNow();
    expect(phone.engine.getStatus()).toEqual({ kind: "offline", pending: 1, since: 0 });
    expect(phone.clock.delays()).toEqual([1000]);
    phone.clock.advance(1000);
    await phone.engine.syncNow();
    expect(phone.clock.delays()).toEqual([2000]);

    network.online = true;
    phone.clock.advance(2000);
    await phone.engine.syncNow();

    expect(phone.engine.getStatus()).toEqual({ kind: "synced", at: 3000 });
    expect(phone.clock.delays()).toEqual([]);
    expect(listTitles(server.stateOf(ada.id as UserId))).toEqual(["Tasks"]);
  });

  it("stops and asks for an update when the server rejects the app version", async () => {
    const { network, device: newDevice } = setup();
    const phone = await newDevice(ada);
    network.updateRequired = true;

    await phone.engine.syncNow();
    await phone.engine.syncNow();

    expect(phone.engine.getStatus()).toEqual({ kind: "updateRequired" });
    expect(phone.clock.delays()).toEqual([]);
  });

  it("syncs again for a change that the user makes during a sync", async () => {
    const { server, device: newDevice } = setup();
    const phone = await newDevice(ada);
    const listId = firstListId(phone.store);

    const first = phone.engine.syncNow();
    phone.store.dispatch(commands.renameList(testContext("p"), listId, "Home"));
    await first;

    expect(phone.engine.getStatus().kind).toBe("synced");
    expect(listTitles(server.stateOf(ada.id as UserId))).toEqual(["Home"]);
    expect(listTitles(phone.store.getSnapshot().state)).toEqual(["Home"]);
  });

  it("sends a long outbox in more than one push", async () => {
    const { server, network, device: newDevice } = setup();
    const phone = await newDevice(ada);
    const listId = firstListId(phone.store);
    const context = testContext("p");
    for (let index = 0; index < 2100; index++) {
      phone.store.dispatch(commands.renameList(context, listId, `Name ${String(index)}`));
    }

    await phone.engine.syncNow();

    expect(network.pushes).toBe(3);
    expect(listTitles(server.stateOf(ada.id as UserId))).toEqual(["Name 2099"]);
    expect(await phone.local.pendingMutations()).toEqual([]);
  });
});

describe("pushChunks", () => {
  it("keeps the order and stays below the size limit", () => {
    const context = testContext("c");
    const long = "x".repeat(400);
    const outbox = Array.from({ length: 5000 }, (_, index) => ({
      seq: index + 1,
      mutation: commands.renameTask(context, "task" as never, long),
    }));

    const chunks = pushChunks(outbox);

    expect(chunks.flat()).toEqual(outbox);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
      expect(new TextEncoder().encode(JSON.stringify(chunk)).length).toBeLessThan(1_000_000);
    }
  });
});
