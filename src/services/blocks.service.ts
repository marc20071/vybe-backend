import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { getAdminSupabase } from "../config/database";
import { AppError } from "../utils/app-error";

export async function assertUsersNotBlocked(firstId: string, secondId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.from("user_blocks").select("blocker_id,blocked_id")
    .or(`and(blocker_id.eq.${firstId},blocked_id.eq.${secondId}),and(blocker_id.eq.${secondId},blocked_id.eq.${firstId})`).limit(1);
  if (error) throwDb(error);
  if (data?.length) throw new AppError(403, "USER_BLOCKED", "This interaction is unavailable because one of these users has blocked the other.");
}

export async function blockUser(req: Express.Request, username: string) {
  const user = requireUser(req); const c = db(req); const clean = username.trim().replace(/^@/, "").toLowerCase();
  const { data: target, error } = await c.from("profiles").select("id,username").eq("username", clean).maybeSingle();
  if (error) throwDb(error); if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (target.id === user.id) throw new AppError(400, "CANNOT_BLOCK_SELF", "You cannot block your own account.");
  const admin = getAdminSupabase();
  const { error: blockError } = await admin.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: target.id }, { onConflict: "blocker_id,blocked_id" });
  if (blockError) throwDb(blockError);
  // Blocking is reciprocal for interaction: remove follows both ways and remove any existing direct-message thread memberships.
  const { error: followError } = await admin.from("follows").delete().or(`and(follower_id.eq.${user.id},followed_id.eq.${target.id}),and(follower_id.eq.${target.id},followed_id.eq.${user.id})`);
  if (followError) throwDb(followError);
  return { blocked: true, username: target.username };
}

export async function unblockUser(req: Express.Request, username: string) {
  const user = requireUser(req); const c = db(req); const clean = username.trim().replace(/^@/, "").toLowerCase();
  const { data: target, error } = await c.from("profiles").select("id,username").eq("username", clean).maybeSingle();
  if (error) throwDb(error); if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  const { error: deleteError } = await db(req).from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target.id);
  if (deleteError) throwDb(deleteError);
  return { blocked: false, username: target.username };
}

export async function listBlockedUsers(req: Express.Request) {
  const user = requireUser(req); const c = db(req);
  const { data, error } = await c.from("user_blocks").select("blocked_id,created_at").eq("blocker_id", user.id).order("created_at", { ascending: false });
  if (error) throwDb(error); const rows = data || [];
  const profiles = await profileMap(c, rows.map((row: any) => String(row.blocked_id)));
  return { items: rows.map((row: any) => { const p: any = profiles.get(row.blocked_id); return { userId: row.blocked_id, username: p?.username || "user", displayName: p?.display_name || p?.username || "VYBE user", avatarUrl: p?.avatar_url || null, blockedAt: row.created_at }; }) };
}
