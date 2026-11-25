import { describe, expect, it } from "vitest";
import { createHttpTransport } from "./http.ts";
import { protocolVersion, type ClientId } from "./protocol.ts";

const pull = { protocol: protocolVersion, clientId: "client" as ClientId, since: 3 };

/** A transport whose fetch answers every request with this response. */
function answering(response: () => Response) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const transport = createHttpTransport((url, init) => {
    requests.push({ url, init });
    return Promise.resolve(response());
  });
  return { transport, requests };
}

describe("createHttpTransport", () => {
  it("pulls with the version in the query, and reads the changes", async () => {
    const changes = { kind: "ok", version: 4, lastSeq: 0, lists: [], tasks: [] };
    const { transport, requests } = answering(() => Response.json(changes));

    expect(await transport.pull(pull)).toEqual({ kind: "ok", value: changes });
    expect(requests[0]?.url).toBe(`/api/sync/pull?protocol=1&clientId=client&since=3`);
    expect(requests[0]?.init?.credentials).toBe("same-origin");
  });

  it("pushes JSON", async () => {
    const { transport, requests } = answering(() => Response.json({ kind: "ok" }));

    expect(await transport.push({ ...pull, entries: [] })).toEqual({ kind: "ok", value: null });
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("asks to sign in on 401", async () => {
    const { transport } = answering(() =>
      Response.json({ error: "signInRequired" }, { status: 401 }),
    );

    expect(await transport.pull(pull)).toEqual({ kind: "signInRequired" });
  });

  it("asks for an update when the server says so", async () => {
    const { transport } = answering(() => Response.json({ kind: "updateRequired" }));

    expect(await transport.pull(pull)).toEqual({ kind: "updateRequired" });
  });

  it("is offline when the request fails or a proxy answers", async () => {
    const failing = createHttpTransport(() => Promise.reject(new TypeError("Failed to fetch")));
    const { transport: proxy } = answering(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    expect(await failing.pull(pull)).toEqual({ kind: "offline" });
    expect(await proxy.pull(pull)).toEqual({ kind: "offline" });
  });

  it("gives the reason of an error from the API", async () => {
    const { transport } = answering(() =>
      Response.json({ error: "invalid", reason: "since must be an integer" }, { status: 400 }),
    );

    expect(await transport.pull(pull)).toEqual({
      kind: "error",
      status: 400,
      message: "since must be an integer",
    });
  });

  it("reads the user of the session, or null without one", async () => {
    const user = { id: "u1", email: "ada@example.com", name: "Ada", image: null };
    const { transport: signedIn } = answering(() => Response.json({ session: { id: "s1" }, user }));
    const { transport: signedOut } = answering(() => Response.json(null));

    expect(await signedIn.session()).toEqual({
      kind: "ok",
      value: { id: "u1", email: "ada@example.com", name: "Ada" },
    });
    expect(await signedOut.session()).toEqual({ kind: "ok", value: null });
  });
});
