import type { Room } from "./durable-objects/room";

export const workerEnvironment = {
  required: [] as const,
  optional: ["GREETING"] as const,
};

export interface Env {
  GREETING?: string;
  ROOM: DurableObjectNamespace<Room>;
}
