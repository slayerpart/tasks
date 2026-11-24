/** The box of the text in an element, without its padding. */
function textBox(element: HTMLElement): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
}

/**
 * Moves a copy of a title from `source` to `target`, so the title of a list stays on the screen
 * while it turns from a row title into the screen title, or back. The copy changes its place,
 * its size and its color. The real titles are transparent during the flight. The copy is only
 * decoration: assistive technology and the pointer do not see it.
 * Returns a function that ends the flight at once.
 */
export function flyTitle(source: HTMLElement, target: HTMLElement, durationMs: number): () => void {
  const from = textBox(source);
  const to = textBox(target);
  const sourceStyle = getComputedStyle(source);
  const targetStyle = getComputedStyle(target);

  const copy = document.createElement("span");
  copy.textContent = source.textContent;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    zIndex: "2",
    margin: "0",
    padding: "0",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    transformOrigin: "0 0",
    fontFamily: sourceStyle.fontFamily,
    fontSize: sourceStyle.fontSize,
    fontWeight: sourceStyle.fontWeight,
    letterSpacing: sourceStyle.letterSpacing,
    lineHeight: "normal",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(copy);
  // The copy has its own line height, so its text box can start a little lower or higher.
  const own = textBox(copy);
  const left = from.left - own.left;
  const top = from.top - own.top;
  const scale = from.height > 0 ? to.height / from.height : 1;

  const targetOpacity = target.style.opacity;
  source.style.opacity = "0";
  target.style.opacity = "0";

  const flight = copy.animate(
    [
      { transform: `translate(${String(left)}px, ${String(top)}px)`, color: sourceStyle.color },
      {
        transform: `translate(${String(left + to.left - from.left)}px, ${String(top + to.top - from.top)}px) scale(${String(scale)})`,
        color: targetStyle.color,
      },
    ],
    // Fast at the start, so the title leaves its old place at once.
    { duration: durationMs, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "both" },
  );

  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    flight.cancel();
    copy.remove();
    target.style.opacity = targetOpacity;
  };
  flight.addEventListener("finish", land);
  return land;
}
