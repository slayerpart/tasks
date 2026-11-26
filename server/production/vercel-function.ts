import type { IncomingMessage, ServerResponse } from "node:http";
import { openNeonDatabase } from "../db/neon-database.ts";
import { sendWebResponse, toWebRequest } from "../node-adapter.ts";
import { readProductionConfig } from "./config.ts";
import { createProductionApi } from "./production-server.ts";

// The entry of the Vercel function for all of `/api`. The build bundles it into one file.

const result = readProductionConfig(process.env);
if (result.kind === "invalid") {
  // The deploy then shows the problems in the logs of the function.
  throw new Error(`The settings of the server are not valid. ${result.problems.join(" ")}`);
}
const { config } = result;
const api = createProductionApi(config, () => openNeonDatabase(config.databaseUrl));

export default async function handler(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  try {
    // Vercel keeps the original path in the request URL after the route to the function.
    await sendWebResponse(await api(toWebRequest(incoming, config.origin)), outgoing);
  } catch (error) {
    console.error(error);
    outgoing.statusCode = 500;
    outgoing.end();
  }
}
