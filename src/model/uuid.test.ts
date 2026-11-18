import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "./uuid.ts";

const version4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives a version 4 UUID", () => {
    expect(randomUuid()).toMatch(version4);
  });

  it("builds a unique version 4 UUID where crypto.randomUUID is missing, as over plain HTTP", () => {
    const realCrypto = crypto;
    vi.stubGlobal("crypto", { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    const ids = Array.from({ length: 1000 }, () => randomUuid());

    expect(ids.every((id) => version4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
