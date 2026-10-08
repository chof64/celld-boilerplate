import { z } from "zod";

export const roomParams = z.object({
  roomId: z.string().trim().min(1).max(128),
});
