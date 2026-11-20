import { applyMutation } from "../model/apply.ts";
import {
  browserCommandContext,
  createList,
  mutationBase,
  type CommandContext,
} from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { visibleLists } from "../model/selectors.ts";
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
    queue = queue
      .then(() => local.commit(mutation))
      .catch((error: unknown) => {
        console.error("Could not save a change on this device.", error);
        failedSinceIdle = true;
      })
      .then(settle);
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
  };

  if (visibleLists(snapshot.state).length === 0) {
    store.dispatch(createList(snapshot.state, context, 0, firstListTitle));
  }
  return store;
}
