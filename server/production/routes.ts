// The routes of the Vercel deploy, in the format of `config.json` of the Build Output API.

/** The app loads only its own files and talks only to its own server. */
const contentSecurityPolicy = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** The E2E tests use them too, on the preview server. */
export const securityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export const vercelConfig = {
  version: 3,
  routes: [
    { src: "^/(.*)$", headers: securityHeaders, continue: true },
    // The names of the built files change with their content.
    {
      src: "^/assets/(.*)$",
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      continue: true,
    },
    // One function serves all of `/api`. It keeps the original path in the request URL.
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    // The app shows the screen of the path.
    { src: "^/(.*)$", dest: "/index.html" },
  ],
} as const;
