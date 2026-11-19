import { afterEach, expect, it } from "vitest";
import { guardAgainstTextSelection } from "./selection-guard.ts";

let cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  document.body.replaceChildren();
});

function nextSelectionChange(): Promise<void> {
  return new Promise((resolve) => {
    document.addEventListener(
      "selectionchange",
      () => {
        setTimeout(resolve, 0);
      },
      { once: true },
    );
  });
}

it("clears a text selection outside text fields as soon as it appears", async () => {
  cleanups.push(guardAgainstTextSelection(document));
  const paragraph = document.createElement("p");
  paragraph.textContent = "Buy oat milk";
  document.body.append(paragraph);

  const changed = nextSelectionChange();
  document.getSelection()?.selectAllChildren(paragraph);
  await changed;

  expect(document.getSelection()?.toString()).toBe("");
});

it("keeps a selection inside a text field", async () => {
  cleanups.push(guardAgainstTextSelection(document));
  const input = document.createElement("input");
  input.value = "Buy oat milk";
  document.body.append(input);
  input.focus();

  input.select();
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 12]);
});
