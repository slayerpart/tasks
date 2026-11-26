import type { PullChanges, PullRequest, PushRequest } from "./protocol.ts";

/** The result of a request to the server, as the sync engine needs it. */
export type ServerResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  /** No valid session. */
  | { readonly kind: "signInRequired" }
  /** The server does not accept this version of the app. */
  | { readonly kind: "updateRequired" }
  /** The request did not reach the server, or no answer came back. */
  | { readonly kind: "offline" }
  /** The server answered with an error. */
  | { readonly kind: "error"; readonly status: number; readonly message: string };

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** The requests that the sync engine sends. */
export interface SyncTransport {
  /** The user of the session cookie, or null without a session. */
  session(): Promise<ServerResult<SessionUser | null>>;
  push(request: PushRequest): Promise<ServerResult<null>>;
  pull(request: PullRequest): Promise<ServerResult<PullChanges>>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function send(fetcher: Fetch, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  try {
    return await fetcher(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    return null;
  }
}

async function read<T>(response: Response | null): Promise<ServerResult<T>> {
  if (response === null) return { kind: "offline" };
  if (response.status === 401) return { kind: "signInRequired" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A proxy or a dropped connection, not our API.
    return response.ok || response.status >= 500
      ? { kind: "offline" }
      : { kind: "error", status: response.status, message: response.statusText };
  }
  if (!response.ok) {
    const reason =
      typeof body === "object" && body !== null && "reason" in body ? String(body.reason) : "";
    return { kind: "error", status: response.status, message: reason || response.statusText };
  }
  if (typeof body === "object" && body !== null && "kind" in body) {
    if (body.kind === "updateRequired") return { kind: "updateRequired" };
  }
  return { kind: "ok", value: body as T };
}

/** Sends the requests to the API of the same origin. */
export function createHttpTransport(fetcher: Fetch = (input, init) => fetch(input, init)) {
  return {
    async session() {
      const result = await read<{ user: SessionUser } | null>(
        await send(fetcher, "/api/auth/get-session"),
      );
      if (result.kind !== "ok") return result;
      const user = result.value?.user;
      return {
        kind: "ok",
        value: user === undefined ? null : { id: user.id, email: user.email, name: user.name },
      };
    },
    async push(request) {
      const result = await read<{ kind: "ok" }>(
        await send(fetcher, "/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }),
      );
      return result.kind === "ok" ? { kind: "ok", value: null } : result;
    },
    async pull(request) {
      const query = new URLSearchParams({
        protocol: String(request.protocol),
        clientId: request.clientId,
        since: String(request.since),
      });
      return read<PullChanges>(await send(fetcher, `/api/sync/pull?${query.toString()}`));
    },
  } as const satisfies SyncTransport;
}

/** The requests of the account section of the settings. */
export interface AccountTransport {
  /** The IDs of the providers that the server offers, such as "google". */
  providers(): Promise<ServerResult<readonly string[]>>;
  /**
   * Starts a sign-in with a provider. It returns the page of the provider. After the sign-in,
   * the provider sends the browser back to `returnPath`, with `?error=` when it failed.
   */
  startSignIn(provider: string, returnPath: string): Promise<ServerResult<string>>;
  signOut(): Promise<ServerResult<null>>;
  /** Ends all sessions of the user, on all devices. */
  signOutEverywhere(): Promise<ServerResult<null>>;
}

function postJson(fetcher: Fetch, path: string, body: unknown) {
  return send(fetcher, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createAccountTransport(fetcher: Fetch = (input, init) => fetch(input, init)) {
  return {
    async providers() {
      const result = await read<unknown>(await send(fetcher, "/api/providers"));
      if (result.kind !== "ok") return result;
      const body = result.value;
      const ids =
        typeof body === "object" && body !== null && "providers" in body
          ? body.providers
          : undefined;
      return Array.isArray(ids) && ids.every((id) => typeof id === "string")
        ? { kind: "ok", value: ids }
        : { kind: "error", status: 200, message: "The server sent no list of providers." };
    },
    async startSignIn(provider, returnPath) {
      const result = await read<{ url: string }>(
        await postJson(fetcher, "/api/auth/sign-in/social", {
          provider,
          callbackURL: returnPath,
          errorCallbackURL: returnPath,
        }),
      );
      return result.kind === "ok" ? { kind: "ok", value: result.value.url } : result;
    },
    async signOut() {
      const result = await read(await postJson(fetcher, "/api/auth/sign-out", {}));
      return result.kind === "ok" ? { kind: "ok", value: null } : result;
    },
    async signOutEverywhere() {
      const result = await read(await postJson(fetcher, "/api/auth/revoke-sessions", {}));
      return result.kind === "ok" ? { kind: "ok", value: null } : result;
    },
  } as const satisfies AccountTransport;
}
