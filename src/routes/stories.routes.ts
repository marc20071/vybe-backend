import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/stories.controller";
import { authenticate } from "../middleware/authenticate";
import { optionalAuth } from "../middleware/optional-auth";
import { validateBody } from "../middleware/validate";

const musicSchema = z.object({
  provider: z.string().min(1).max(40), trackId: z.string().min(1).max(100), title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200), audioUrl: z.url().refine((v) => v.startsWith("https://"), "Music audio URL must use HTTPS."), licenseUrl: z.url().nullable().optional(), imageUrl: z.url().nullable().optional(),
  startSeconds: z.number().int().min(0).max(3600).optional(), durationSeconds: z.number().int().min(1).max(60).optional(),
});
const storySchema = z.object({
  type: z.enum(["text", "image", "video"]), mediaId: z.uuid().optional(), text: z.string().max(1000).optional(),
  textStyle: z.record(z.string(), z.unknown()).optional(), visibility: z.enum(["public", "followers", "private"]).optional(),
  music: musicSchema.nullable().optional(), originalAudioMuted: z.boolean().optional(),
  musicVolume: z.number().min(0).max(1).optional(), originalVolume: z.number().min(0).max(1).optional(),
});
const updateSchema = storySchema.partial();
const r = Router();
r.get("/music/search", optionalAuth, c.musicSearch);
r.get("/", optionalAuth, c.list);
r.post("/", authenticate, validateBody(storySchema), c.create);
r.get("/:id/comments", optionalAuth, c.listComments);
r.post("/:id/comments", authenticate, validateBody(z.object({ body: z.string().trim().min(1).max(1000) })), c.comment);
r.post("/:id/likes", authenticate, c.like);
r.delete("/:id/likes", authenticate, c.unlike);
r.get("/:id/views", authenticate, c.views);
r.post("/:id/views", authenticate, c.view);
r.patch("/:id", authenticate, validateBody(updateSchema), c.update);
r.delete("/:id", authenticate, c.remove);
export default r;
