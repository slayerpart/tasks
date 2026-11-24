/** A hint is text with key names in it, for example ["Press ", { key: "N" }, " to add"]. */
export type HintPart = string | { readonly key: string };
export type Hint = readonly HintPart[];

export function hintText(hint: Hint): string {
  return hint.map((part) => (typeof part === "string" ? part : part.key)).join("");
}
