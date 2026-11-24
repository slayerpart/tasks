/**
 * True for an event from a menu that renders outside the element in the page. React still
 * passes the event up through the element, which must not act on it.
 */
export function fromPortal(event: {
  readonly target: EventTarget;
  readonly currentTarget: Element;
}): boolean {
  return !(event.target instanceof Node && event.currentTarget.contains(event.target));
}

/** True when the user types into a field, so single-key shortcuts must not act. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement
      ? target.type !== "checkbox"
      : target instanceof HTMLTextAreaElement || target.isContentEditable)
  );
}
