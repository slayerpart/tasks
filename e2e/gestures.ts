import type { Locator, Page } from "@playwright/test";

type PointerKind = "touch" | "mouse";

interface DragOptions {
  readonly steps?: number;
  readonly pointerType?: PointerKind;
}

/** Drags a pointer sideways from the center of an element. */
export function swipe(target: Locator, distance: number, options?: DragOptions): Promise<void> {
  return drag(target, distance, 0, options);
}

/** Drags a pointer down from the center of an element. */
export function pull(target: Locator, distance: number, options?: DragOptions): Promise<void> {
  return drag(target, 0, distance, options);
}

/**
 * Drags a pointer from the center of an element, one move per animation frame.
 * Playwright can only tap on touch screens, so the events are synthetic.
 */
async function drag(
  target: Locator,
  dx: number,
  dy: number,
  { steps = 8, pointerType = "touch" }: DragOptions = {},
): Promise<void> {
  await target.evaluate(
    async (element, options) => {
      const box = element.getBoundingClientRect();
      const startX = box.left + box.width / 2;
      const startY = box.top + box.height / 2;
      const nextFrame = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      const fire = (type: string, progress: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 7,
            pointerType: options.pointerType,
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: startX + options.dx * progress,
            clientY: startY + options.dy * progress,
          }),
        );
      fire("pointerdown", 0);
      for (let step = 1; step <= options.steps; step++) {
        await nextFrame();
        fire("pointermove", step / options.steps);
      }
      await nextFrame();
      fire("pointerup", 1);
      // A browser sends a click when a pointer goes down and up on the same element.
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
    },
    { dx, dy, steps, pointerType },
  );
}

/** Completes or uncompletes a task the way the device does it: a click, or a swipe on touch. */
export async function toggleTask(page: Page, hasTouch: boolean, title: string): Promise<void> {
  if (hasTouch) await swipe(page.getByRole("button", { name: `Edit ${title}` }), 160);
  else await page.getByRole("checkbox", { name: title }).click();
}

/** Deletes a task the way the device does it: a click, or a swipe on touch. */
export async function deleteTask(page: Page, hasTouch: boolean, title: string): Promise<void> {
  if (hasTouch) await swipe(page.getByRole("button", { name: `Edit ${title}` }), -160);
  else await page.getByRole("button", { name: `Delete ${title}` }).click();
}
