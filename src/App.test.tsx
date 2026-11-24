import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { openAppStore } from "./app/store.ts";
import { StoreProvider } from "./app/store-context.tsx";
import { FeedbackProvider } from "./feedback/feedback-context.tsx";
import * as commands from "./model/commands.ts";
import { visibleLists } from "./model/selectors.ts";
import { createMemoryLocalStore } from "./test/memory-local-store.ts";
import { createRecordingFeedback } from "./test/recording-feedback.ts";

/** Renders the app on the lists screen of a new device. */
async function renderLists() {
  const store = await openAppStore(createMemoryLocalStore());
  const { feedback, events } = createRecordingFeedback();
  const user = userEvent.setup({
    advanceTimers: (ms) => {
      if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
    },
  });
  render(
    <StoreProvider store={store}>
      <FeedbackProvider feedback={feedback}>
        <App />
      </FeedbackProvider>
    </StoreProvider>,
  );
  return { store, user, feedback: events };
}

/** Renders the app and opens the first list, which every new device has. */
async function renderApp() {
  const rendered = await renderLists();
  await rendered.user.click(screen.getByRole("link", { name: "Tasks" }));
  // The lists screen leaves one render after the list screen appears.
  await waitFor(() => {
    expect(screen.queryByRole("heading", { name: "Lists" })).toBeNull();
  });
  return rendered;
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

  it("adds a task with N at the start, because the task screen has the focus", async () => {
    const { user } = await renderApp();

    await user.keyboard("n");

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "New task" }));
  });

  it("ignores N while the focus is outside the task screen", async () => {
    const { user } = await renderApp();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    await user.keyboard("n");

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("gives the focus back to the active task when Escape closes a new task", async () => {
    const { user } = await renderApp();
    await user.keyboard("n");
    await user.keyboard("Milk{Enter}");

    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Milk" }));
  });

  it.each([["{Escape}"], ["{Enter}"]])(
    "keeps the focus in the screen when %s closes an empty new task in an empty list",
    async (key) => {
      const { user } = await renderApp();
      await user.keyboard("n");

      await user.keyboard(key);
      await user.keyboard("n");

      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "New task" }));
    },
  );

  it("keeps the focus in the screen after the last task is deleted, so N still works", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);
    screen.getByRole("button", { name: "Edit Milk" }).focus();

    await user.keyboard("{Delete}");
    await user.keyboard("n");

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "New task" }));
  });

  it("does not create a task from an empty draft", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("heading", { name: "Tasks" }));

    expect(titles()).toEqual([]);
    expect(
      within(screen.getByRole("list", { name: "Tips" }))
        .getAllByRole("listitem")
        .map((tip) => tip.textContent),
    ).toEqual(["Click + or press N to add a task"]);
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
    screen.getByRole("button", { name: "List actions" }).focus();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Bread" }));

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Milk" }));

    // The title, the actions menu and the delete button of the row, and then out of the list.
    await user.tab();
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

  it("shows tips step by step until the list has 3 tasks", async () => {
    const { user } = await renderApp();
    const tips = () =>
      within(screen.getByRole("list", { name: "Tips" }))
        .queryAllByRole("listitem")
        .map((tip) => tip.textContent);

    expect(tips()).toEqual(["Click + or press N to add a task"]);

    await addTasks(user, ["Milk"]);
    await waitFor(() => {
      expect(tips()).toEqual([
        "Hover a task, then click ○ to complete it or × to delete it",
        "Or press X to complete or Delete to delete the selected task",
      ]);
    });

    await addTasks(user, ["Bread", "Eggs"]);
    await waitFor(() => {
      expect(tips()).toEqual([]);
    });
  });
});

describe("undo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The toast, unless it is gone or leaving. A leaving toast is inert. */
  function toast() {
    const card = screen.queryByRole("button", { name: "Undo" })?.closest("[data-toast]");
    return card === undefined || card === null || card.hasAttribute("inert") ? null : card;
  }

  it("shows a toast after a delete, and its Undo button brings the task back with focus", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(screen.getByRole("button", { name: "Delete Milk" }));
    expect(toast()?.textContent).toContain("Deleted “Milk”");
    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Milk", "Bread"]);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Milk" }));
    await waitFor(() => {
      expect(toast()).toBeNull();
    });
  });

  it("shows the undo shortcut on the Undo button, which keeps its name", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);

    await user.click(screen.getByRole("button", { name: "Delete Milk" }));

    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.getAttribute("aria-keyshortcuts")).toBe("Control+Z");
    expect(undo.textContent).toBe("UndoCtrl+Z");
  });

  it.each([
    ["Meta", "macOS"],
    ["Control", "other systems"],
  ])("undoes the changes one by one with %s+Z on %s", async (modifier) => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    await user.click(screen.getByRole("checkbox", { name: "Milk" }));

    await user.keyboard(`{${modifier}>}z{/${modifier}}`);
    expect(tasks()).toEqual([
      { title: "Milk", done: false },
      { title: "Bread", done: false },
    ]);

    await user.keyboard(`{${modifier}>}z{/${modifier}}`);
    await waitFor(() => {
      expect(titles()).toEqual(["Milk"]);
    });
  });

  it("leaves Cmd+Z to a text field", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);

    await user.click(screen.getByRole("button", { name: "Edit Milk" }));
    await user.keyboard("{Meta>}z{/Meta}");

    expect(titles()).toEqual(["Milk"]);
  });

  it("plays the sound of the change that undo makes", async () => {
    const { user, feedback } = await renderApp();
    await addTasks(user, ["Milk"]);
    await user.click(screen.getByRole("button", { name: "Delete Milk" }));
    feedback.length = 0;

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(feedback).toEqual([{ kind: "sound", sound: "add" }, { kind: "tap" }]);
  });

  it("closes the toast after 5 seconds, but not while the pointer is on it", async () => {
    // Testing Library waits with setTimeout. The fake clock must also follow real time.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    await user.click(screen.getByRole("button", { name: "Delete Milk" }));

    await user.hover(screen.getByRole("button", { name: "Undo" }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(toast()).not.toBeNull();

    await user.unhover(screen.getByRole("button", { name: "Undo" }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    await waitFor(() => {
      expect(toast()).toBeNull();
    });
  });
});

describe("clear completed", () => {
  /** Adds tasks and completes the ones in `done`. */
  async function setUp(names: readonly string[], done: readonly string[]) {
    const app = await renderApp();
    await addTasks(app.user, names);
    for (const name of done) {
      await app.user.click(screen.getByRole("checkbox", { name }));
    }
    return app;
  }

  const toastText = () =>
    screen.queryByRole("button", { name: "Undo" })?.closest("[data-toast]")?.textContent;

  it("clears the completed tasks with Shift+Backspace, and Undo brings them back", async () => {
    const { user, feedback } = await setUp(["Milk", "Bread", "Eggs"], ["Milk", "Eggs"]);
    screen.getByRole("button", { name: "Edit Bread" }).focus();
    feedback.length = 0;

    await user.keyboard("{Shift>}{Backspace}{/Shift}");

    await waitFor(() => {
      expect(titles()).toEqual(["Bread"]);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Bread" }));
    expect(toastText()).toContain("Cleared 2 completed tasks");
    expect(feedback).toEqual([{ kind: "sound", sound: "delete" }, { kind: "tap" }]);

    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(tasks()).toEqual([
        { title: "Bread", done: false },
        { title: "Eggs", done: true },
        { title: "Milk", done: true },
      ]);
    });
  });

  it("moves the focus from a cleared task to the last open task", async () => {
    const { user } = await setUp(["Milk", "Bread", "Eggs"], ["Eggs"]);
    screen.getByRole("button", { name: "Edit Eggs" }).focus();

    await user.keyboard("{Shift>}{Backspace}{/Shift}");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Bread" }));
    expect(toastText()).toContain("Cleared 1 completed task");
  });

  it("moves the focus to the Add task button when no open task is left", async () => {
    const { user } = await setUp(["Milk"], ["Milk"]);
    screen.getByRole("button", { name: "Edit Milk" }).focus();

    await user.keyboard("{Shift>}{Backspace}{/Shift}");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add task" }));
  });

  it("does nothing when no task is completed", async () => {
    const { user, feedback } = await setUp(["Milk"], []);
    screen.getByRole("button", { name: "Edit Milk" }).focus();
    feedback.length = 0;

    await user.keyboard("{Shift>}{Backspace}{/Shift}");

    expect(titles()).toEqual(["Milk"]);
    expect(feedback).toEqual([]);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("clears the completed tasks from the list menu", async () => {
    const { user } = await setUp(["Milk", "Bread"], ["Milk"]);

    await user.click(screen.getByRole("button", { name: "List actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear completed" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Bread"]);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "List actions" }));
    expect(toastText()).toContain("Cleared 1 completed task");
  });

  it("disables Clear completed in the list menu when no task is completed", async () => {
    const { user } = await setUp(["Milk"], []);

    await user.click(screen.getByRole("button", { name: "List actions" }));

    expect(
      screen.getByRole("menuitem", { name: "Clear completed" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("row actions menu", () => {
  const actions = (title: string) => screen.getByRole("button", { name: `Actions for ${title}` });
  const items = () =>
    within(screen.getByRole("menu"))
      .getAllByRole("menuitem")
      .map((item) => ({
        label: item.textContent,
        disabled: item.getAttribute("aria-disabled") === "true",
      }));

  it("lists the actions of an open task, and disables the moves that are not possible", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(actions("Milk"));

    expect(items()).toEqual([
      { label: "Complete", disabled: false },
      { label: "Edit", disabled: false },
      { label: "Move up", disabled: true },
      { label: "Move down", disabled: false },
      { label: "Delete", disabled: false },
    ]);
  });

  it("moves a task down, and keeps the focus on its menu button", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(actions("Milk"));
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));

    expect(titles()).toEqual(["Bread", "Milk"]);
    expect(document.activeElement).toBe(actions("Milk"));
  });

  it("completes a task, which then has no moves in its menu", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(actions("Milk"));
    await user.click(screen.getByRole("menuitem", { name: "Complete" }));

    expect(tasks()).toEqual([
      { title: "Bread", done: false },
      { title: "Milk", done: true },
    ]);
    expect(document.activeElement).toBe(actions("Milk"));
    await user.keyboard("{Enter}");
    expect(items().map((item) => item.label)).toEqual(["Uncomplete", "Edit", "Delete"]);
  });

  it("opens the title for editing", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk"]);

    await user.click(actions("Milk"));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const field = screen.getByRole("textbox", { name: "Task title" });
    expect(document.activeElement).toBe(field);
    expect((field as HTMLInputElement).value).toBe("Milk");
  });

  it("deletes a task with an undo toast, and focuses the next task", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(actions("Milk"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Bread"]);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Bread" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
  });

  it("keeps the arrow keys in the open menu, away from the rows", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    await user.click(actions("Milk"));

    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("moves between rows with the arrow keys on the menu button, like on the other controls", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    actions("Milk").focus();

    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(actions("Bread"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves a task with Alt and the arrow keys on the menu button", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    actions("Milk").focus();

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

    expect(titles()).toEqual(["Bread", "Milk"]);
    expect(document.activeElement).toBe(actions("Milk"));
  });

  it("undoes with Cmd+Z while the menu is open", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);
    await user.click(screen.getByRole("checkbox", { name: "Milk" }));
    await user.click(actions("Bread"));

    await user.keyboard("{Meta>}z{/Meta}");

    expect(tasks()).toEqual([
      { title: "Milk", done: false },
      { title: "Bread", done: false },
    ]);
  });

  it.each([
    ["Complete", "Milk is done"],
    ["Move down", "Milk moved to place 2 of 2"],
  ])("announces the result of %s", async (action, message) => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(actions("Milk"));
    await user.click(screen.getByRole("menuitem", { name: action }));

    expect(screen.getByText(message).closest('[role="status"]')).not.toBeNull();
  });
});

describe("navigation", () => {
  /** The text that screen readers read after the name. */
  function description(element: HTMLElement): string {
    const id = element.getAttribute("aria-describedby") ?? "";
    return document.getElementById(id)?.textContent ?? "";
  }

  async function back(): Promise<void> {
    const popped = new Promise((resolve) => {
      window.addEventListener("popstate", resolve, { once: true });
    });
    window.history.back();
    await popped;
  }

  it("opens on the lists screen on a new device", async () => {
    await renderLists();

    expect(screen.getByRole("heading", { level: 1, name: "Lists" })).toBeDefined();
    const lists = within(screen.getByRole("list", { name: "Lists" }));
    const link = lists.getByRole("link", { name: "Tasks" });
    expect(lists.getAllByRole("link")).toEqual([link]);
    expect(description(link)).toBe("0 open tasks");
    expect(document.title).toBe("Lists - Tasks");
  });

  it("opens a list at its own URL and gives it the focus", async () => {
    const { store } = await renderApp();
    const list = visibleLists(store.getSnapshot().state)[0];

    expect(window.location.pathname).toBe(`/lists/${list?.id ?? ""}`);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Tasks" }));
    expect(document.title).toBe("Tasks - Tasks");
  });

  it("goes back to the lists screen with the Lists link, with the focus on the list", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread"]);

    await user.click(screen.getByRole("link", { name: "Lists" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });

    const link = screen.getByRole("link", { name: "Tasks" });
    expect(description(link)).toBe("2 open tasks");
    expect(document.activeElement).toBe(link);
    expect(
      screen.getByText("Lists", { selector: "span" }).closest('[role="status"]'),
    ).not.toBeNull();
  });

  it("goes up with Escape, but Escape first closes a new task or a menu", async () => {
    const { user } = await renderApp();

    await user.keyboard("n");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "List actions" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeDefined();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Tasks" }));
  });

  it("moves the focus from the opened list to its first or last task with the arrow keys", async () => {
    const { user } = await renderApp();
    await addTasks(user, ["Milk", "Bread", "Eggs"]);
    screen.getByRole("region", { name: "Tasks" }).focus();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Milk" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Bread" }));

    screen.getByRole("region", { name: "Tasks" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Eggs" }));
  });

  it("goes back to the lists screen with browser back", async () => {
    await renderApp();

    await act(back);

    expect(screen.getByRole("heading", { level: 1, name: "Lists" })).toBeDefined();
  });

  it("shows the lists screen for an unknown path", async () => {
    window.history.replaceState(null, "", "/unknown");

    await renderLists();

    expect(screen.getByRole("heading", { level: 1, name: "Lists" })).toBeDefined();
    expect(window.location.pathname).toBe("/");
  });

  it("goes to the lists screen when the open list is deleted", async () => {
    const { store } = await renderApp();
    const list = visibleLists(store.getSnapshot().state)[0];
    if (list === undefined) throw new Error("Setup failed.");

    act(() => {
      store.dispatch(commands.deleteList(commands.browserCommandContext, list.id));
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.getByRole("heading", { level: 1, name: "Lists" })).toBeDefined();
  });
});

describe("lists screen", () => {
  const actions = (title: string) => screen.getByRole("button", { name: `Actions for ${title}` });
  const link = (title: string) => screen.getByRole("link", { name: title });

  /** The lists in order, each with the number of its open tasks. */
  function lists(): [string, string][] {
    return within(screen.getByRole("list", { name: "Lists" }))
      .getAllByRole("link")
      .map((element) => {
        const id = element.getAttribute("aria-describedby") ?? "";
        return [element.textContent, document.getElementById(id)?.textContent ?? ""];
      });
  }

  async function addLists(user: ReturnType<typeof userEvent.setup>, names: readonly string[]) {
    await user.click(screen.getByRole("button", { name: "Add list" }));
    for (const name of names) {
      await user.keyboard(`${name}{Enter}`);
    }
    await user.keyboard("{Escape}");
  }

  /** Opens a list, adds tasks to it, and goes back to the lists screen. */
  async function addTasksTo(
    user: ReturnType<typeof userEvent.setup>,
    title: string,
    names: readonly string[],
  ) {
    await user.click(link(title));
    await addTasks(user, names);
    await user.click(screen.getByRole("link", { name: "Lists" }));
    await screen.findByRole("heading", { level: 1, name: "Lists" });
  }

  it("adds lists at the top with the Add list button, one after another with Enter", async () => {
    const { user } = await renderLists();

    await addLists(user, ["Groceries", "Work"]);

    expect(lists()).toEqual([
      ["Groceries", "0 open tasks"],
      ["Work", "0 open tasks"],
      ["Tasks", "0 open tasks"],
    ]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Added “Work”").closest('[role="status"]')).not.toBeNull();
  });

  it("adds a list with N while the focus is in the screen", async () => {
    const { user } = await renderLists();

    await user.keyboard("n");

    expect(screen.getByRole("textbox", { name: "New list" })).toBe(document.activeElement);
  });

  it("renames a list from its menu", async () => {
    const { user } = await renderLists();

    await user.click(actions("Tasks"));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.clear(screen.getByRole("textbox", { name: "List title" }));
    await user.keyboard("Home{Enter}");

    expect(lists()).toEqual([["Home", "0 open tasks"]]);
    expect(document.activeElement).toBe(link("Home"));
  });

  it("completes all open tasks of a list, and Undo brings them back", async () => {
    const { user } = await renderLists();
    await addTasksTo(user, "Tasks", ["Milk", "Bread"]);

    await user.click(actions("Tasks"));
    await user.click(screen.getByRole("menuitem", { name: "Complete all" }));

    expect(lists()).toEqual([["Tasks", "0 open tasks"]]);
    expect(screen.getByText("Completed 2 tasks in “Tasks”")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(lists()).toEqual([["Tasks", "2 open tasks"]]);
  });

  it("disables Complete all for a list without open tasks", async () => {
    const { user } = await renderLists();

    await user.click(actions("Tasks"));

    expect(
      screen.getByRole("menuitem", { name: "Complete all" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("deletes a list with Delete, moves the focus to the next list, and Undo restores it with its tasks", async () => {
    const { user } = await renderLists();
    await addTasksTo(user, "Tasks", ["Milk"]);
    await addLists(user, ["Groceries"]);
    link("Groceries").focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(link("Tasks"));

    await user.keyboard("{Delete}");

    await waitFor(() => {
      expect(lists()).toEqual([["Groceries", "0 open tasks"]]);
    });
    expect(document.activeElement).toBe(link("Groceries"));
    expect(screen.getByText("Deleted “Tasks”")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(lists()).toEqual([
      ["Groceries", "0 open tasks"],
      ["Tasks", "1 open task"],
    ]);
    expect(document.activeElement).toBe(link("Tasks"));
  });

  it("moves a list with Alt and the arrow keys, and tells screen readers about it", async () => {
    const { user } = await renderLists();
    await addLists(user, ["Groceries"]);
    link("Groceries").focus();

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

    expect(lists().map(([title]) => title)).toEqual(["Tasks", "Groceries"]);
    expect(document.activeElement).toBe(link("Groceries"));
    expect(
      screen.getByText("Groceries moved to place 2 of 2").closest('[role="status"]'),
    ).not.toBeNull();
  });

  it("undoes the last change with Cmd+Z", async () => {
    const { user } = await renderLists();
    await addLists(user, ["Groceries"]);

    await user.keyboard("{Meta>}z{/Meta}");

    await waitFor(() => {
      expect(lists().map(([title]) => title)).toEqual(["Tasks"]);
    });
  });

  it("returns the focus to the list after Escape on a new list or a rename", async () => {
    const { user } = await renderLists();
    link("Tasks").focus();

    await user.keyboard("n");
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(link("Tasks"));

    await user.click(actions("Tasks"));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(link("Tasks"));
  });

  it("keeps the focus in the screen after the last list is deleted, and tells how to add one", async () => {
    const { user } = await renderLists();
    link("Tasks").focus();

    await user.keyboard("{Delete}");

    await waitFor(() => {
      expect(screen.queryAllByRole("link", { name: "Tasks" })).toEqual([]);
    });
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Lists" }));
    expect(
      within(screen.getByRole("list", { name: "Tips" })).getByRole("listitem").textContent,
    ).toBe("Click + or press N to add a list");
  });

  it("moves the focus from the screen to the first or last list with the arrow keys", async () => {
    const { user } = await renderLists();
    await addLists(user, ["Groceries"]);
    screen.getByRole("region", { name: "Lists" }).focus();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(link("Groceries"));

    screen.getByRole("region", { name: "Lists" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(link("Tasks"));
  });

  it("opens a list from its menu", async () => {
    const { user } = await renderLists();

    await user.click(actions("Tasks"));
    await user.click(screen.getByRole("menuitem", { name: "Open" }));

    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeDefined();
  });
});
