import type { DisplayTask } from "../../model/selectors.ts";
import { previewMove } from "../rows/reorder.ts";

/** The list as it looks while an open task moves from `from` to `to`. Heat follows position. */
export function previewOrder(
  items: readonly DisplayTask[],
  from: number,
  to: number,
): readonly DisplayTask[] {
  const open = items.flatMap((item) => (item.kind === "open" ? [item] : []));
  const moved = previewMove(open, from, to);
  if (moved === open) return items;
  return [...moved, ...items.filter((item) => item.kind === "completed")];
}
