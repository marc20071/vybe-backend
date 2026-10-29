import type { Express } from "express";
import { db, requireUser, throwDb } from "./shared";
import { AppError } from "../utils/app-error";
import { getAdminSupabase } from "../config/database";
import { assertUsersNotBlocked } from "./blocks.service";

export async function setReaction(req: Express.Request, postId: string, kind: "like" | "save", active: boolean) {
  const user = requireUser(req), c = db(req);
  const { data: post, error: postError } = await c.from("posts").select("id,user_id,visibility").eq("id", postId).maybeSingle();
  if (postError) throwDb(postError);
  if (!post || post.visibility !== "public") throw new AppError(404, "POST_NOT_FOUND", "Post not found.");
  if (post.user_id !== user.id) await assertUsersNotBlocked(user.id, String(post.user_id));

  const { data: existing, error: existingError } = await c.from("reactions").select("post_id").eq("user_id", user.id).eq("post_id", postId).eq("kind", kind).maybeSingle();
  if (existingError) throwDb(existingError);
  if (active) {
    const { error } = await c.from("reactions").upsert({ user_id: user.id, post_id: postId, kind }, { onConflict: "user_id,post_id,kind" });
    if (error) throwDb(error);
    if (kind === "like" && !existing && post.user_id !== user.id) {
      try {
        const { data: actor } = await c.from("profiles").select("username").eq("id", user.id).maybeSingle();
        await getAdminSupabase().from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "like", message: `@${actor?.username || "someone"} liked your post.` });
      } catch { /* Notification failure must not undo a successful like. */ }
    }
  } else {
    const { error } = await c.from("reactions").delete().eq("user_id", user.id).eq("post_id", postId).eq("kind", kind);
    if (error) throwDb(error);
  }
  const { count, error } = await c.from("reactions").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("kind", kind);
  if (error) throwDb(error);
  return { liked: kind === "like" && active, count: count || 0 };
}
