import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { AppError } from "../utils/app-error";
import { getAdminSupabase } from "../config/database";
import { assertUsersNotBlocked } from "./blocks.service";

export async function followStatus(req: Express.Request, username: string) {
  const c = db(req);
  const { data: profile, error: profileError } = await c.from("profiles").select("id,is_private").eq("username", username.replace(/^@/, "").toLowerCase()).maybeSingle();
  if (profileError) throwDb(profileError);
  if (!profile) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  const [{ count }, { data }, requestResult] = await Promise.all([
    c.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", profile.id),
    req.authUser ? c.from("follows").select("follower_id").eq("followed_id", profile.id).eq("follower_id", req.authUser.id).maybeSingle() : Promise.resolve({ data: null }),
    req.authUser ? getAdminSupabase().from("follow_requests").select("status").eq("target_id", profile.id).eq("requester_id", req.authUser.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { following: Boolean(data), followerCount: count || 0, isPrivate: Boolean((profile as any).is_private), requestPending: !data && Boolean((profile as any).is_private) && (requestResult as any).data?.status === "pending" };
}

export async function setFollow(req: Express.Request, username: string, active: boolean) {
  const user = requireUser(req), c = db(req);
  const { data: profile, error: profileError } = await c.from("profiles").select("id,username,is_private").eq("username", username.replace(/^@/, "").toLowerCase()).maybeSingle();
  if (profileError) throwDb(profileError);
  if (!profile) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (profile.id === user.id) throw new AppError(400, "CANNOT_FOLLOW_SELF", "You cannot follow yourself.");
  await assertUsersNotBlocked(user.id, profile.id);

  const { data: existing, error: existingError } = await c.from("follows").select("follower_id").eq("follower_id", user.id).eq("followed_id", profile.id).maybeSingle();
  if (existingError) throwDb(existingError);
  const admin = getAdminSupabase();
  if (active && (profile as any).is_private && !existing) {
    const { data: prior, error: priorError } = await admin.from("follow_requests").select("status").eq("requester_id", user.id).eq("target_id", profile.id).maybeSingle();
    if (priorError) throwDb(priorError);
    if (prior?.status === "pending") return { requestPending: true };
    const { error } = await admin.from("follow_requests").upsert({ requester_id: user.id, target_id: profile.id, status: "pending", updated_at: new Date().toISOString() }, { onConflict: "requester_id,target_id" });
    if (error) throwDb(error);
    try { await admin.from("notifications").insert({ user_id: profile.id, actor_id: user.id, type: "follow_request", message: `@${(await c.from("profiles").select("username").eq("id", user.id).maybeSingle()).data?.username || "someone"} requested to follow you.` }); } catch { /* Notification failures do not block a request. */ }
    return { requestPending: true };
  }
  if (active) {
    if (!existing) {
      const { error } = await c.from("follows").insert({ follower_id: user.id, followed_id: profile.id });
      if (error) throwDb(error);
    }
    if (!existing) {
      try { await admin.from("notifications").insert({ user_id: profile.id, actor_id: user.id, type: "follow", message: `@${(await c.from("profiles").select("username").eq("id", user.id).maybeSingle()).data?.username || "someone"} started following you.` }); } catch { /* A notification must not fail the follow action. */ }
    }
  } else {
    const { error } = await c.from("follows").delete().eq("follower_id", user.id).eq("followed_id", profile.id);
    if (error) throwDb(error);
    await admin.from("follow_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("requester_id", user.id).eq("target_id", profile.id).eq("status", "pending");
  }
}


export async function listFollowRequests(req: Express.Request) {
  const user = requireUser(req), admin = getAdminSupabase();
  const { data, error } = await admin.from("follow_requests").select("id,requester_id,created_at").eq("target_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(100);
  if (error) throwDb(error);
  const profiles = await profileMap(db(req), [...new Set<string>((data || []).map((x: any) => String(x.requester_id)))]);
  return { items: (data || []).map((x: any) => { const p: any = profiles.get(x.requester_id) || {}; return { id: x.id, username: p.username || "user", displayName: p.display_name || p.username || "VYBE user", avatarUrl: p.avatar_url || null, createdAt: x.created_at }; }) };
}

export async function respondFollowRequest(req: Express.Request, requestId: string, approve: boolean) {
  const user = requireUser(req), admin = getAdminSupabase();
  const { data: request, error } = await admin.from("follow_requests").select("id,requester_id,target_id,status").eq("id", requestId).eq("target_id", user.id).maybeSingle();
  if (error) throwDb(error); if (!request || request.status !== "pending") throw new AppError(404, "FOLLOW_REQUEST_NOT_FOUND", "Pending follow request not found.");
  if (approve) {
    const { error: followError } = await admin.from("follows").upsert({ follower_id: request.requester_id, followed_id: user.id }, { onConflict: "follower_id,followed_id" }); if (followError) throwDb(followError);
  }
  const { error: updateError } = await admin.from("follow_requests").update({ status: approve ? "approved" : "rejected", updated_at: new Date().toISOString() }).eq("id", requestId); if (updateError) throwDb(updateError);
  try { await admin.from("notifications").insert({ user_id: request.requester_id, actor_id: user.id, type: approve ? "follow_request_approved" : "follow_request_rejected", message: approve ? "Your follow request was approved." : "Your follow request was declined." }); } catch {}
  return { approved: approve };
}
