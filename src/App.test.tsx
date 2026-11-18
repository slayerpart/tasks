import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";
import { openAppStore } from "./app/store.ts";
import { StoreProvider } from "./app/store-context.tsx";
import { FeedbackProvider } from "./feedback/feedback-context.tsx";
import { createMemoryLocalStore } from "./test/memory-local-store.ts";
import { createRecordingFeedback } from "./test/recording-feedback.ts";

async function renderApp() {
  const store = await openAppStore(createMemoryLocalStore());
  const { feedback, events } = createRecordingFeedback();
  const user = userEvent.setup();
  render(
    <StoreProvider store={store}>
      <FeedbackProvider feedback={feedback}>
        <App />
      </FeedbackProvider>
    </StoreProvider>,
  );
  return { store, user, feedback: events };
}

/** The task list in display order. Each row has one checkbox, named after its task. */
function tasks(): { title: string; done: boolean }[] {
  return within(screen.getByRole("list", { name: "Tasks" }))
    .queryAllByRole("checkbox")
    .map((box) => ({
      title: box.getAttribute("aria-label") ?? "",
      done: (box as HTMLInputElement).checked,
    }));
}

function titles(): string[] {
  return tasks().map((task) => task.title);
}

async function addTasks(user: ReturnType<typeof userEvent.setup>, names: readonly string[]) {
  await user.click(screen.getByRole("button", { name: "Add task" }));
  for (const name of names) {
    await user.keyboard(`${name}{Enter}`);
  }
  await user.keyboard("{Escape}");
}

describe("App", () => {
  it("shows the first list as the main heading", async () => {
    await renderApp();

    expect(
      within(screen.getByRole("main")).getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeDefined();
  });

  it("adds tasks one after another with Enter", async () => {
    const { user } = await renderApp();

    await addTasks(user, ["Milk", "Bread", "Eggs"]);

    expect(titles()).toEqual(["Milk", "Bread", "Eggs"]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("adds a task at the top with N", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);

    await user.keyboard("n");
    await user.keyboard("Tea{Enter}{Escape}");

    expect(titles()).toEqual(["Tea", "Milk"]);
  });

  it("does not create a task from an empty draft", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("heading", { name: "Tasks" }));

    expect(titles()).toEqual([]);
    expect(screen.getByText("Nothing to do. Add a task with +.")).toBeDefined();
  });

  it("moves a completed task below the open tasks, and back to the end when uncompleted", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread", "Eggs"]);

    await user.click(screen.getByRole("checkbox", { name: "Milk" }));

    expect(tasks()).toEqual([
      { title: "Bread", done: false },
      { title: "Eggs", done: false },
      { title: "Milk", done: true },
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Milk" }));

    expect(tasks()).toEqual([
      { title: "Bread", done: false },
      { title: "Eggs", done: false },
      { title: "Milk", done: false },
    ]);
  });

  it("puts only the last active row in the tab order and moves between rows with the arrow keys", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    screen.getByRole("button", { name: "Add task" }).focus();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Bread" }));

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Milk" }));

    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it("completes the focused task with X", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    screen.getByRole("button", { name: "Edit Milk" }).focus();

    await user.keyboard("x");

    expect(tasks()).toEqual([
      { title: "Bread", done: false },
      { title: "Milk", done: true },
    ]);
  });

  it("deletes the focused task with Delete and focuses the next one", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread", "Eggs"]);
    screen.getByRole("button", { name: "Edit Bread" }).focus();

    await user.keyboard("{Delete}");

    // The row leaves the DOM after its exit animation.
    await waitFor(() => {
      expect(titles()).toEqual(["Milk", "Eggs"]);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Eggs" }));
  });

  it("moves the focused task with Alt and the arrow keys and keeps the focus on it", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread", "Eggs"]);
    screen.getByRole("button", { name: "Edit Milk" }).focus();

    await user.keyboard("{Alt>}{ArrowDown}{ArrowDown}{/Alt}");

    expect(titles()).toEqual(["Bread", "Eggs", "Milk"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Milk" }));
  });

  it("renames a task, and Enter then starts a new task below it", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Eggs"]);

    await user.click(screen.getByRole("button", { name: "Edit Milk" }));
    await user.clear(screen.getByRole("textbox", { name: "Task title" }));
    await user.keyboard("Oat milk{Enter}");
    await user.keyboard("Bread{Enter}{Escape}");

    expect(titles()).toEqual(["Oat milk", "Bread", "Eggs"]);
  });

  it("keeps the old title when the user cancels an edit with Escape", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);

    await user.click(screen.getByRole("button", { name: "Edit Milk" }));
    await user.keyboard("{Backspace}{Backspace}{Escape}");

    expect(titles()).toEqual(["Milk"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Milk" }));
  });

  it("plays a sound and a haptic tap for each add, complete, uncomplete and delete", async () => {
    const { user, feedback } = await renderApp();

    await addTasks(user, ["Milk"]);
    await user.click(screen.getByRole("checkbox", { name: "Milk" }));
    await user.click(screen.getByRole("checkbox", { name: "Milk" }));
    await user.click(screen.getByRole("button", { name: "Delete Milk" }));

    expect(feedback).toEqual(
      (["add", "complete", "uncomplete", "delete"] as const).flatMap((sound) => [
        { kind: "sound", sound },
        { kind: "tap" },
      ]),
    );
  });

  it("gives no feedback when nothing changes", async () => {
    const { user, feedback } = await renderApp();
    await addTasks(user, ["Milk"]);
    feedback.length = 0;

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Edit Milk" }));
    await user.keyboard("{Enter}{Escape}");

    expect(feedback).toEqual([]);
  });
});
