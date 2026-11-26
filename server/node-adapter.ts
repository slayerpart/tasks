import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/** A handler of the Web Fetch API. It returns null for a request that is not its own. */
export type WebHandler = (request: Request) => Promise<Response | null>;

/** Builds a Web request from a Node request. */
export function toWebRequest(incoming: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(incoming.url ?? "/", origin), {
    method,
    headers,
    ...(hasBody
      ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half" }
      : {}),
  });
}

/** Writes a Web response to a Node response, with each cookie as its own header. */
export async function sendWebResponse(response: Response, outgoing: ServerResponse): Promise<void> {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") outgoing.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) outgoing.setHeader("Set-Cookie", cookies);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * Connect middleware for Vite and `node:http`: the handler answers its own requests, and the
 * others go to `next`.
 */
export function nodeMiddleware(handler: WebHandler) {
  return (incoming: IncomingMessage, outgoing: ServerResponse, next: () => void): void => {
    const host = incoming.headers.host ?? "localhost";
    handler(toWebRequest(incoming, `http://${host}`))
      .then(async (response) => {
        if (response === null) next();
        else await sendWebResponse(response, outgoing);
      })
      .catch((error: unknown) => {
        console.error(error);
        outgoing.statusCode = 500;
        outgoing.end();
      });
  };
}
