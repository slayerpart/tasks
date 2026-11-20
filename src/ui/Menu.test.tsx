import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Menu } from "./Menu.tsx";

function renderMenu() {
  const selected: string[] = [];
  const item = (label: string, disabled = false) => ({
    label,
    disabled,
    onSelect: () => {
      selected.push(label);
    },
  });
  render(
    <>
      <Menu label="Actions" icon="⋯" items={[item("Copy"), item("Paste", true), item("Delete")]} />
      <button type="button">After</button>
    </>,
  );
  return { user: userEvent.setup(), selected };
}

const button = () => screen.getByRole("button", { name: "Actions" });
const item = (name: string) => screen.getByRole("menuitem", { name });

/** The open menu. A closing menu is inert during its exit animation. */
function openMenu() {
  const menu = screen.queryByRole("menu");
  return menu === null || menu.hasAttribute("inert") ? null : menu;
}

describe("Menu", () => {
  it("opens on a click with the focus on the first item", async () => {
    const { user } = renderMenu();

    await user.click(button());

    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(item("Copy"));
  });

  it("opens with ArrowUp on the last item, and moves with the arrow keys, Home and End", async () => {
    const { user } = renderMenu();
    button().focus();

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item("Delete"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Copy"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Paste"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("Delete"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("Copy"));
  });

  it("closes with Escape and gives the focus back to the button", async () => {
    const { user } = renderMenu();
    button().focus();
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("does the action of an item, closes and gives the focus back to the button", async () => {
    const { user, selected } = renderMenu();
    button().focus();
    await user.keyboard("{ArrowUp}{Enter}");

    expect(selected).toEqual(["Delete"]);
    expect(openMenu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("keeps a disabled item in the menu, but it does nothing", async () => {
    const { user, selected } = renderMenu();
    await user.click(button());

    expect(item("Paste").getAttribute("aria-disabled")).toBe("true");
    await user.click(item("Paste"));

    expect(selected).toEqual([]);
    expect(openMenu()).not.toBeNull();
  });

  it("closes with Tab and gives the focus back to the button, its place in the tab order", async () => {
    const { user } = renderMenu();
    await user.click(button());

    await user.tab();

    expect(openMenu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("closes on a press outside, and leaves the focus to that press", async () => {
    const { user } = renderMenu();
    await user.click(button());

    await user.click(screen.getByRole("button", { name: "After" }));

    expect(openMenu()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }));
  });

  it("closes when the focus moves outside, for example by a shortcut", async () => {
    const { user } = renderMenu();
    await user.click(button());

    act(() => {
      screen.getByRole("button", { name: "After" }).focus();
    });

    expect(openMenu()).toBeNull();
  });

  it("focuses the first item when it opens again during its exit animation", async () => {
    const { user } = renderMenu();
    await user.click(button());
    await user.keyboard("{Escape}");

    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(item("Copy"));
  });

  it("closes on a second click on the button", async () => {
    const { user } = renderMenu();
    await user.click(button());

    await user.click(button());

    expect(openMenu()).toBeNull();
  });
});
