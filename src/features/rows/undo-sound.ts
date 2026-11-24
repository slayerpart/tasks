import type { Sound } from "../../feedback/feedback.ts";
import type { Mutation } from "../../model/mutations.ts";

/** The sound for the change that an undo makes. Other undos give only a haptic tap. */
const undoSounds = {
  restoreList: "add",
  restoreTasks: "add",
  deleteList: "delete",
  deleteTask: "delete",
  completeTask: "complete",
  uncompleteTask: "uncomplete",
  uncompleteTasks: "uncomplete",
} as const satisfies Partial<Record<Mutation["type"], Sound>>;

export function undoSound(type: Mutation["type"]): Sound | undefined {
  return type in undoSounds ? undoSounds[type as keyof typeof undoSounds] : undefined;
}
