import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { vercelConfig } from "./routes.ts";

// Writes the Vercel Build Output (https://vercel.com/docs/build-output-api) from the app in
// `dist` and the API. Run it after `vite build`.

const root = new URL("../../", import.meta.url);
const output = new URL(".vercel/output/", root);
const functionDir = new URL("functions/api.func/", output);

await rm(output, { recursive: true, force: true });
await cp(new URL("dist/", root), new URL("static/", output), { recursive: true });

// One file with all the dependencies, so the function needs no node_modules.
await build({
  configFile: false,
  root: fileURLToPath(root),
  logLevel: "warn",
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: fileURLToPath(new URL("vercel-function.ts", import.meta.url)),
    outDir: fileURLToPath(functionDir),
    target: "node26",
    minify: false,
    rolldownOptions: { output: { entryFileNames: "index.mjs", codeSplitting: false } },
  },
});
await mkdir(functionDir, { recursive: true });
await writeFile(
  new URL(".vc-config.json", functionDir),
  `${JSON.stringify(
    {
      runtime: "nodejs26.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      regions: ["fra1"],
      maxDuration: 30,
    },
    null,
    2,
  )}\n`,
);
await writeFile(new URL("config.json", output), `${JSON.stringify(vercelConfig, null, 2)}\n`);
