import type { DisplayList } from "../../model/selectors.ts";

/** An option of the list switcher: a list, or a new list with the text of the search. */
export type SwitcherOption =
  | { readonly kind: "list"; readonly item: DisplayList }
  | { readonly kind: "create"; readonly title: string };

function comparable(text: string): string {
  return text.trim().toLocaleLowerCase();
}

/**
 * The lists whose title contains the search text, in their own order. When no title is the
 * same as the text, the last option creates a list with it.
 */
export function switcherOptions(lists: readonly DisplayList[], search: string): SwitcherOption[] {
  const text = search.trim();
  const needle = comparable(text);
  const matches = lists.filter(({ list }) => comparable(list.title).includes(needle));
  const options: SwitcherOption[] = matches.map((item) => ({ kind: "list", item }));
  if (text !== "" && !matches.some(({ list }) => comparable(list.title) === needle)) {
    options.push({ kind: "create", title: text });
  }
  return options;
}
