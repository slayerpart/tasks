import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("shows the app title as the main heading", () => {
    render(<App />);

    const main = screen.getByRole("main");
    const heading = screen.getByRole("heading", { level: 1, name: "Tasks" });

    expect(main.contains(heading)).toBe(true);
  });
});
