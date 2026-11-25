import { applyMutation } from "../model/apply.ts";
import {
  browserCommandContext,
  createList,
  mutationBase,
  type CommandContext,
} from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import type { MutationId, State } from "../model/types.ts";
import { inverseOf } from "../model/undo.ts";
import type { LocalStore } from "../storage/local-store.ts";

export interface AppSnapshot {
  readonly state: State;
  /** True when the last save failed. The state then shows what is saved on the device. */
  readonly saveFailed: boolean;
}

export interface AppStore {
  readonly getSnapshot: () => AppSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Shows the change at once and saves it in the background, in the order of dispatch. */
  readonly dispatch: (mutation: Mutation) => void;
  /** Resolves when all dispatched changes are saved or have failed. */
  readonly idle: () => Promise<void>;
  /**
   * Undoes the change with this ID, or else the newest change that is not undone.
   * It returns null when there is nothing to undo. The history lasts for the session.
   */
  readonly undo: (mutationId?: MutationId) => Undone | null;
  /**
   * Runs a task on the device data after all earlier saves and before later ones, for example
   * a pull. `reload` shows the data of the device again, with the changes that still wait to
   * be saved on top.
   */
  /** Calls the listener after each change of the user, also an undo. */
  readonly onLocalChange: (listener: () => void) => () => void;
  readonly exclusive: <T>(
    task: (local: LocalStore, reload: () => Promise<void>) => Promise<T>,
  ) => Promise<T>;
}

export interface Undone {
  /** The ID of the change that the user undid. */
  readonly mutationId: MutationId;
  /** The change that undid it. */
  readonly inverse: Mutation;
}

/** The inverse gets a new ID and time when the user undoes the change. */
type HistoryEntry = Undone;

const firstListTitle = "Tasks";

/** Loads the data on this device and returns a store that is ready to render. */
export async function openAppStore(
  local: LocalStore,
  context: CommandContext = browserCommandContext,
): Promise<AppStore> {
  let snapshot: AppSnapshot = { state: await local.load(), saveFailed: false };
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let failedSinceIdle = false;
  const history: HistoryEntry[] = [];
  /** The changes that the user made and the device has not saved yet, oldest first. */
  const unsaved: Mutation[] = [];
  const changeListeners = new Set<() => void>();

  function publish(next: AppSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  /** After a failed save, memory and device differ. Load the saved state when nothing is pending. */
  async function settle(): Promise<void> {
    pending--;
    if (pending > 0) return;
    if (failedSinceIdle) {
      failedSinceIdle = false;
      publish({ state: await local.load(), saveFailed: true });
    } else if (snapshot.saveFailed) {
      publish({ ...snapshot, saveFailed: false });
    }
  }

  function apply(mutation: Mutation): void {
    publish({ ...snapshot, state: applyMutation(snapshot.state, mutation) });
    pending++;
    unsaved.push(mutation);
    for (const listener of changeListeners) listener();
    queue = queue
      .then(() => local.commit(mutation))
      .catch((error: unknown) => {
        console.error("Could not save a change on this device.", error);
        failedSinceIdle = true;
      })
      .then(() => {
        unsaved.shift();
        return settle();
      });
  }

  async function reload(): Promise<void> {
    const saved = await local.load();
    publish({ ...snapshot, state: unsaved.reduce(applyMutation, saved) });
  }

  const store: AppStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (mutation) => {
      const inverse = inverseOf(snapshot.state, mutation, context);
      if (inverse !== null) history.push({ mutationId: mutation.mutationId, inverse });
      apply(mutation);
    },
    idle: () => queue,
    undo: (mutationId) => {
      const index =
        mutationId === undefined
          ? history.length - 1
          : history.findIndex((entry) => entry.mutationId === mutationId);
      const [entry] = index < 0 ? [] : history.splice(index, 1);
      if (entry === undefined) return null;
      const inverse = { ...entry.inverse, ...mutationBase(context) };
      apply(inverse);
      return { mutationId: entry.mutationId, inverse };
    },
    onLocalChange: (listener) => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    exclusive: (task) => {
      const run = queue.then(() => task(local, reload));
      // A failed task must not stop the saves after it.
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  // Only on the first start. A user who deletes all lists keeps no lists.
  // The first list is not a change of the user, so there is no undo for it.
  if (snapshot.state.lists.size === 0) {
    apply(createList(snapshot.state, context, 0, firstListTitle));
  }
  return store;
}
