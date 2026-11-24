import { createContext } from "react";

/**
 * True inside a screen that leaves. Its rows then have no layout animation: the page scrolls
 * for the new screen, and Motion would read that as a move of the rows.
 */
export const ScreenLeavingContext = createContext(false);
