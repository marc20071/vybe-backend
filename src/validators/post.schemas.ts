import { z } from "zod";

export const createPostSchema = z.object({
  caption: z.string().trim().max(2200).optional().default(""),
  mediaId: z.uuid(),
  visibility: z.enum(["public", "followers", "private"]).optional().default("public"),
});
