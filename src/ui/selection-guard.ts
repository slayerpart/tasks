/**
 * Clears every text selection outside a text field as soon as it appears. The page has no
 * selectable text, but iOS can still select a word with its own long-press gesture, for
 * example while the user holds a row to move it.
 */
export function guardAgainstTextSelection(document: Document): () => void {
  const onSelectionChange = () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const selection = document.getSelection();
    if (selection !== null && !selection.isCollapsed) selection.removeAllRanges();
  };
  document.addEventListener("selectionchange", onSelectionChange);
  return () => {
    document.removeEventListener("selectionchange", onSelectionChange);
  };
}
