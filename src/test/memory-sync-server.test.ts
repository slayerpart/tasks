import { describeSyncServer } from "../sync/sync-server.contract.ts";
import { createMemorySyncServer } from "./memory-sync-server.ts";

describeSyncServer("MemorySyncServer", () => Promise.resolve(createMemorySyncServer()));
