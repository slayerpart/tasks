import fc from "fast-check";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState, type MutationId } from "../model/types.ts";
import {
  applyPull,
  initialSync,
  localState,
  pullRequest,
  pushRequest,
  type ClientSync,
} from "../sync/client-core.ts";
import type { ClientId, PullRequest, PullResponse, PushRequest } from "../sync/protocol.ts";
import type { UserId } from "../sync/server-core.ts";
import { createMemorySyncServer, type MemorySyncServer } from "./memory-sync-server.ts";
import { commandFor, step, testContext, type Step } from "./random-steps.ts";

/**
 * A simulated world for sync tests: two devices of user A, one device of user B, and a client
 * of user B that attacks the data of user A. The network loses, repeats and reorders messages.
 */
export const userA = "user-a" as UserId;
export const userB = "user-b" as UserId;

export interface Device {
  readonly userId: UserId;
  readonly clientId: ClientId;
  readonly context: commands.CommandContext;
  sync: ClientSync;
  nextSeq: number;
  /** Every change that the user made on this device. */
  readonly made: Mutation[];
  /** The changes that a pull confirmed, so the device removed them from its outbox. */
  readonly confirmed: Set<MutationId>;
}

function device(userId: UserId, name: string): Device {
  return {
    userId,
    clientId: `client-${name}` as ClientId,
    context: testContext(name),
    sync: initialSync,
    nextSeq: 1,
    made: [],
    confirmed: new Set(),
  };
}

/** A request on its way to the server, or a response on its way back. */
type InFlight =
  | { readonly kind: "push"; readonly device: Device; readonly request: PushRequest }
  | {
      readonly kind: "pull";
      readonly device: Device;
      readonly request: PullRequest;
      readonly response: PullResponse;
    };

/** A change that tries to touch the data of user A from the account of user B. */
type Attack = "renameTask" | "deleteList" | "createTask" | "takeListId";

type Action =
  | { readonly type: "edit"; readonly device: number; readonly step: Step }
  /** The device sends its outbox. The request waits in the network. */
  | { readonly type: "push"; readonly device: number }
  /** The server answers a pull now. The response waits in the network. */
  | { readonly type: "pull"; readonly device: number }
  /** A message arrives. With `keep`, a copy stays in the network, so it arrives again later. */
  | { readonly type: "arrive"; readonly pick: number; readonly keep: boolean }
  /** A message is lost, for example when the device goes offline. */
  | { readonly type: "lose"; readonly pick: number }
  | { readonly type: "attack"; readonly attack: Attack; readonly pick: number };

const action: fc.Arbitrary<Action> = fc.oneof(
  { arbitrary: fc.record({ type: fc.constant("edit"), device: fc.nat(), step }), weight: 6 },
  { arbitrary: fc.record({ type: fc.constant("push"), device: fc.nat() }), weight: 2 },
  { arbitrary: fc.record({ type: fc.constant("pull"), device: fc.nat() }), weight: 2 },
  {
    arbitrary: fc.record({ type: fc.constant("arrive"), pick: fc.nat(), keep: fc.boolean() }),
    weight: 4,
  },
  { arbitrary: fc.record({ type: fc.constant("lose"), pick: fc.nat() }), weight: 1 },
  {
    arbitrary: fc.record({
      type: fc.constant("attack"),
      attack: fc.constantFrom<Attack>("renameTask", "deleteList", "createTask", "takeListId"),
      pick: fc.nat(),
    }),
    weight: 1,
  },
);

/** Two devices of user A and one device of user B, all on one server. */
export class World {
  readonly server: MemorySyncServer;
  readonly devices = [device(userA, "a1"), device(userA, "a2"), device(userB, "b1")] as const;
  readonly network: InFlight[] = [];
  /** A client of user B that sends changes on the rows of user A. */
  readonly attacker = device(userB, "evil");

  constructor(server: MemorySyncServer = createMemorySyncServer()) {
    this.server = server;
  }

  async run(next: Action): Promise<void> {
    switch (next.type) {
      case "edit":
        this.edit(this.deviceAt(next.device), next.step);
        return;
      case "push": {
        const target = this.deviceAt(next.device);
        if (target.sync.outbox.length === 0) return;
        this.network.push({
          kind: "push",
          device: target,
          request: pushRequest(target.sync, target.clientId),
        });
        return;
      }
      case "pull":
        this.network.push(await this.startPull(this.deviceAt(next.device)));
        return;
      case "arrive": {
        const index = next.pick % Math.max(this.network.length, 1);
        const message = this.network[index];
        if (message === undefined) return;
        if (!next.keep) this.network.splice(index, 1);
        await this.deliver(message);
        return;
      }
      case "lose":
        this.network.splice(next.pick % Math.max(this.network.length, 1), 1);
        return;
      case "attack":
        await this.attack(next.attack, next.pick);
        return;
    }
  }

  /** The network comes back: each device pushes, and then each device pulls. */
  async settle(): Promise<void> {
    for (const target of this.devices) {
      await this.deliver({
        kind: "push",
        device: target,
        request: pushRequest(target.sync, target.clientId),
      });
    }
    for (const target of this.devices) {
      await this.deliver(await this.startPull(target));
    }
  }

  private deviceAt(index: number): Device {
    return this.devices[index % this.devices.length] ?? this.devices[0];
  }

  private edit(target: Device, next: Step): void {
    const mutation = commandFor(localState(target.sync), target.context, next, target.made.length);
    if (mutation === null) return;
    target.made.push(mutation);
    target.sync = {
      ...target.sync,
      outbox: [...target.sync.outbox, { seq: target.nextSeq++, mutation }],
    };
  }

  private async startPull(target: Device): Promise<InFlight> {
    const request = pullRequest(target.sync, target.clientId);
    const response = await this.server.pull(target.userId, request);
    return { kind: "pull", device: target, request, response };
  }

  private async deliver(message: InFlight): Promise<void> {
    if (message.kind === "push") {
      await this.server.push(message.device.userId, message.request);
      return;
    }
    const { device: target, request, response } = message;
    if (response.kind !== "ok") throw new Error("The server asked for an update.");
    const before = target.sync.outbox;
    target.sync = applyPull(target.sync, request, response);
    const kept = new Set(target.sync.outbox);
    for (const entry of before) {
      if (!kept.has(entry)) target.confirmed.add(entry.mutation.mutationId);
    }
  }

  private async attack(attack: Attack, pick: number): Promise<void> {
    const victim = this.server.stateOf(userA);
    const lists = [...victim.lists.values()];
    const tasks = [...victim.tasks.values()];
    const list = lists[pick % Math.max(lists.length, 1)];
    const task = tasks[pick % Math.max(tasks.length, 1)];
    const { context } = this.attacker;
    let mutation: Mutation | null = null;
    if (attack === "renameTask" && task !== undefined) {
      mutation = commands.renameTask(context, task.id, "Hacked");
    } else if (attack === "deleteList" && list !== undefined) {
      mutation = commands.deleteList(context, list.id);
    } else if (attack === "createTask" && list !== undefined) {
      mutation = commands.createTask(emptyState, context, list.id, 0, "Spam");
    } else if (attack === "takeListId" && list !== undefined) {
      mutation = commands.createList(emptyState, context, 0, "Mine", list.id);
    }
    if (mutation === null) return;
    this.attacker.made.push(mutation);
    await this.server.push(userB, {
      ...pushRequest(this.attacker.sync, this.attacker.clientId),
      entries: [{ seq: this.attacker.nextSeq++, mutation }],
    });
  }
}

/** Long runs, so attacks, lost messages and late responses all occur. */
export const actions = fc.array(action, { minLength: 20, maxLength: 150, size: "max" });
