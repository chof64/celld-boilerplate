import type { Room } from "../src/api/durable-objects/room";

export const workerEnvironment = {
  required: [] as const,
  optional: ["GREETING"] as const,
};

export interface Env {
  GREETING?: string;
  ROOM: DurableObjectNamespace<Room>;
}
