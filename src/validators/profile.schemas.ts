
import { z } from "zod";

export const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60).optional(),
    bio: z.string().max(300).optional(),
    avatarUrl: z.url().nullable().optional(),
    avatarMediaId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      !(value.avatarMediaId !== undefined && value.avatarUrl !== undefined),
    {
      message: "Provide either avatarMediaId or avatarUrl, not both.",
    }
  );
