import type { AppStore } from "../app/store.ts";
import { visibleLists } from "../model/selectors.ts";
import type { StoredSync, SyncAccount } from "../storage/local-store.ts";
import type { ServerResult, SessionUser, SyncTransport } from "./http.ts";
import { protocolVersion, type OutboxEntry, type PullRequest } from "./protocol.ts";

/** What the sync status bar shows. `pending` counts the changes that wait for the server. */
export type SyncStatus =
  | { readonly kind: "syncing"; readonly pending: number }
  | { readonly kind: "synced"; readonly at: number }
  | { readonly kind: "offline"; readonly pending: number; readonly since: number }
  | { readonly kind: "signInRequired"; readonly pending: number }
  | {
      readonly kind: "error";
      readonly pending: number;
      readonly message: string;
      readonly retryAt: number;
    }
  | { readonly kind: "updateRequired" }
  | { readonly kind: "accountMismatch"; readonly user: SessionUser };

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
  /** A number in [0, 1), for the spread of retries. */
  random(): number;
}

export const browserClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (id) => {
    window.clearTimeout(id);
  },
  random: () => Math.random(),
};

export interface SyncEngine {
  readonly getStatus: () => SyncStatus;
  /** The user of the session at the last check. Undefined before the first check. */
  readonly getUser: () => SessionUser | null | undefined;
  /**
   * The account that the data of this device belongs to, or null before its first sync.
   * Undefined before the engine has read the device.
   */
  readonly getAccount: () => SyncAccount | null | undefined;
  readonly subscribe: (listener: () => void) => () => void;
  /** Syncs now. A call during a sync makes one more sync after it. */
  readonly syncNow: () => Promise<void>;
  /** Starts the sync triggers: now, on visibility, on network, on changes and on a timer. */
  readonly start: () => () => void;
  /** Stops all syncs for good. It resolves when a sync that runs has ended. */
  readonly stop: () => Promise<void>;
}

export interface SyncEngineOptions {
  readonly store: AppStore;
  readonly transport: SyncTransport;
  /** The title of the list that the app creates on a new device. */
  readonly firstListTitle: string;
  readonly clock?: Clock;
}

/** Limits of one push. They stay below the limits of the server. */
const maxPushEntries = 1000;
const maxPushBytes = 900_000;
/** Sync while visible, so changes from other devices come in. */
const intervalMs = 30_000;
/** Wait a little after a change, so a burst of changes goes in one push. */
const changeDelayMs = 1000;
const maxRetryMs = 60_000;

/** Splits the outbox into pushes that the server accepts. */
export function pushChunks(outbox: readonly OutboxEntry[]): OutboxEntry[][] {
  const chunks: OutboxEntry[][] = [];
  let chunk: OutboxEntry[] = [];
  let bytes = 0;
  for (const entry of outbox) {
    const size = new TextEncoder().encode(JSON.stringify(entry)).length;
    if (chunk.length > 0 && (chunk.length >= maxPushEntries || bytes + size > maxPushBytes)) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(entry);
    bytes += size;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

/**
 * True when the outbox holds only the list that the app made on its own on this device, with
 * no change after it.
 */
function onlyFirstList(sync: StoredSync, title: string): OutboxEntry | null {
  const [entry, ...rest] = sync.outbox;
  if (entry === undefined || rest.length > 0) return null;
  const { mutation } = entry;
  return mutation.type === "createList" && mutation.title === title ? entry : null;
}

/** A failure that ends a sync. */
type Stop = Exclude<ServerResult<unknown>, { kind: "ok" }>;

class Stopped extends Error {
  constructor(readonly reason: Stop | { readonly kind: "accountMismatch"; user: SessionUser }) {
    super(reason.kind);
  }
}

function value<T>(result: ServerResult<T>): T {
  if (result.kind !== "ok") throw new Stopped(result);
  return result.value;
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { store, transport, firstListTitle, clock = browserClock } = options;
  let status: SyncStatus = { kind: "syncing", pending: 0 };
  let user: SessionUser | null | undefined;
  let account: SyncAccount | null | undefined;
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let failingSince: number | null = null;
  let retryTimer: number | null = null;
  let stopped = false;
  let stopTriggers: (() => void) | null = null;

  function setStatus(next: SyncStatus): void {
    status = next;
    for (const listener of listeners) listener();
  }

  function setUser(next: SessionUser | null): void {
    if (user !== undefined && next?.id === user?.id && next?.email === user?.email) return;
    user = next;
    for (const listener of listeners) listener();
  }

  async function loadSync(): Promise<StoredSync> {
    const sync = await store.exclusive((local) => local.loadSync());
    if (account === undefined || account?.id !== sync.account?.id) {
      account = sync.account;
      for (const listener of listeners) listener();
    }
    return sync;
  }
  const pendingCount = async () => (await loadSync()).outbox.length;

  async function pull(sessionUser: SessionUser): Promise<void> {
    const sync = await loadSync();
    const request: PullRequest = {
      protocol: protocolVersion,
      clientId: sync.clientId,
      since: sync.version,
    };
    const changes = value(await transport.pull(request));
    await store.exclusive(async (local, reload) => {
      if (await local.confirmPull(request.since, changes, sessionUser)) await reload();
    });
  }

  async function push(): Promise<void> {
    const sync = await loadSync();
    for (const entries of pushChunks(sync.outbox)) {
      value(await transport.push({ protocol: protocolVersion, clientId: sync.clientId, entries }));
    }
  }

  async function once(): Promise<void> {
    const pending = await pendingCount();
    // A state that needs the user, or a lost connection, stays until a sync ends. The status
    // must not change on each retry, so the bar and its dialogs stay as they are.
    if (status.kind === "synced" || status.kind === "syncing") {
      setStatus({ kind: "syncing", pending });
    }
    const sessionUser = value(await transport.session());
    setUser(sessionUser);
    if (sessionUser === null) throw new Stopped({ kind: "signInRequired" });
    const before = await loadSync();
    if (before.account !== null && before.account.id !== sessionUser.id) {
      throw new Stopped({ kind: "accountMismatch", user: sessionUser });
    }
    if (before.account === null) {
      // The first sync of this device: see what the account has before sending anything.
      await pull(sessionUser);
      await store.exclusive(async (local, reload) => {
        const sync = await local.loadSync();
        const first = onlyFirstList(sync, firstListTitle);
        if (first !== null && visibleLists(sync.base).length > 0) {
          await local.dropPending([first.seq]);
          await reload();
        }
      });
    }
    await push();
    await pull(sessionUser);
  }

  function scheduleRetry(): number {
    const base = Math.min(1000 * 2 ** failures, maxRetryMs);
    const delay = Math.round(base * (0.8 + 0.4 * clock.random()));
    failures++;
    if (retryTimer !== null) clock.clearTimeout(retryTimer);
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      void syncNow();
    }, delay);
    return clock.now() + delay;
  }

  async function fail(error: unknown): Promise<void> {
    if (!(error instanceof Stopped)) {
      console.error("Sync failed.", error);
      setStatus({
        kind: "error",
        pending: await pendingCount(),
        message: "Unexpected error",
        retryAt: scheduleRetry(),
      });
      return;
    }
    const { reason } = error;
    switch (reason.kind) {
      case "offline":
        failingSince ??= clock.now();
        scheduleRetry();
        setStatus({ kind: "offline", pending: await pendingCount(), since: failingSince });
        return;
      case "error":
        setStatus({
          kind: "error",
          pending: await pendingCount(),
          message: reason.message,
          retryAt: scheduleRetry(),
        });
        return;
      case "signInRequired":
        setUser(null);
        setStatus({ kind: "signInRequired", pending: await pendingCount() });
        return;
      case "updateRequired":
        setStatus({ kind: "updateRequired" });
        return;
      case "accountMismatch":
        setStatus({ kind: "accountMismatch", user: reason.user });
        return;
    }
  }

  async function loop(): Promise<void> {
    do {
      again = false;
      try {
        await once();
        failures = 0;
        failingSince = null;
        // A change during the sync waits for the next run.
        if ((await pendingCount()) === 0) setStatus({ kind: "synced", at: clock.now() });
        else again = true;
      } catch (error) {
        await fail(error);
        return;
      }
    } while (again && !stopped);
  }

  function syncNow(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running !== null) {
      again = true;
      return running;
    }
    if (status.kind === "updateRequired") return Promise.resolve();
    if (retryTimer !== null) {
      clock.clearTimeout(retryTimer);
      retryTimer = null;
    }
    running = loop().finally(() => {
      running = null;
    });
    return running;
  }

  function start(): () => void {
    let changeTimer: number | null = null;
    let intervalTimer: number | null = null;
    const visible = () => document.visibilityState === "visible";
    const tick = () => {
      intervalTimer = clock.setTimeout(() => {
        if (visible()) void syncNow();
        tick();
      }, intervalMs);
    };
    const onVisible = () => {
      if (visible()) void syncNow();
    };
    const onOnline = () => {
      void syncNow();
    };
    const stopChanges = store.onLocalChange(() => {
      if (changeTimer !== null) clock.clearTimeout(changeTimer);
      changeTimer = clock.setTimeout(() => {
        changeTimer = null;
        void syncNow();
      }, changeDelayMs);
    });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    tick();
    void syncNow();
    stopTriggers = () => {
      stopChanges();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      for (const timer of [changeTimer, intervalTimer, retryTimer]) {
        if (timer !== null) clock.clearTimeout(timer);
      }
    };
    return stopTriggers;
  }

  async function stop(): Promise<void> {
    stopped = true;
    stopTriggers?.();
    if (retryTimer !== null) clock.clearTimeout(retryTimer);
    await running;
  }

  return {
    getStatus: () => status,
    getUser: () => user,
    getAccount: () => account,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncNow,
    start,
    stop,
  };
}
