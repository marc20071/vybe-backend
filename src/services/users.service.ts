import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";
import { AppError } from "../utils/app-error";

async function resolveAvatarUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  try {
    const { data, error } = await getAdminSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(path, 86400);
    return !error && data?.signedUrl ? data.signedUrl : null;
  } catch {
    return null;
  }
}

export async function getProfile(req: Express.Request, username: string) {
  const c = db(req);
  const { data, error } = await c.from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at,is_private")
    .eq("username", username.replace(/^@/, "").toLowerCase()).maybeSingle();
  if (error) throwDb(error);
  if (!data) return null;

  const [{ count: followerCount }, { count: followingCount }, { count: postCount }, viewerFollow, requestResult] = await Promise.all([
    c.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", data.id),
    c.from("follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", data.id),
    getAdminSupabase().from("posts").select("id", { count: "exact", head: true }).eq("user_id", data.id),
    req.authUser && req.authUser.id !== data.id ? c.from("follows").select("follower_id").eq("follower_id", req.authUser.id).eq("followed_id", data.id).maybeSingle() : Promise.resolve({ data: req.authUser?.id === data.id ? { follower_id: data.id } : null }),
    req.authUser && req.authUser.id !== data.id ? getAdminSupabase().from("follow_requests").select("status").eq("requester_id", req.authUser.id).eq("target_id", data.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const isOwner = req.authUser?.id === data.id;
  const viewerFollows = Boolean(viewerFollow.data);
  const privateContent = Boolean((data as any).is_private) && !isOwner && !viewerFollows;

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name || "",
    bio: data.bio || "",
    avatarUrl: await resolveAvatarUrl(data.avatar_url),
    createdAt: data.created_at,
    followerCount: followerCount || 0,
    followingCount: followingCount || 0,
    postCount: postCount || 0,
    isPrivate: Boolean((data as any).is_private),
    viewerFollows,
    followRequestPending: (requestResult as any).data?.status === "pending",
    privateContent,
  };
}

export async function listProfilePosts(req: Express.Request, username: string) {
  const c = db(req);
  const { data: profile, error: profileError } = await c.from("profiles")
    .select("id,username,display_name,avatar_url,is_private")
    .eq("username", username.replace(/^@/, "").toLowerCase()).maybeSingle();
  if (profileError) throwDb(profileError);
  if (!profile) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (req.authUser && req.authUser.id !== profile.id) {
    const { data: blocks, error: blockError } = await getAdminSupabase().from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${req.authUser.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${req.authUser.id})`).limit(1);
    if (blockError) throwDb(blockError); if (blocks?.length) return [];
  }

  if ((profile as any).is_private && req.authUser?.id !== profile.id) {
    const { data: follows, error: followError } = req.authUser
      ? await getAdminSupabase().from("follows").select("follower_id").eq("follower_id", req.authUser.id).eq("followed_id", profile.id).maybeSingle()
      : { data: null, error: null };
    if (followError) throwDb(followError);
    if (!follows) return [];
  }

  const { data, error } = await c.from("posts")
    .select("id,user_id,media_id,caption,media_url,media_type,visibility,created_at")
    .eq("user_id", profile.id).in("visibility", ["public", "followers", "private"])
    .order("created_at", { ascending: false }).limit(50);
  if (error) throwDb(error);

  const profileLookup = await profileMap(c, [profile.id]);
  const rows = data || [];
  return Promise.all(rows.map(async (row: any) => {
    let mediaUrl = row.media_url || "";
    if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) mediaUrl = await resolveMediaUrl(mediaUrl);
    const [{ count: likeCount }, { count: commentCount }, liked, saved] = await Promise.all([
      c.from("reactions").select("post_id", { count: "exact", head: true }).eq("post_id", row.id).eq("kind", "like"),
      c.from("comments").select("id", { count: "exact", head: true }).eq("post_id", row.id),
      req.authUser ? c.from("reactions").select("post_id").eq("post_id", row.id).eq("user_id", req.authUser.id).eq("kind", "like").maybeSingle() : Promise.resolve({ data: null }),
      req.authUser ? c.from("reactions").select("post_id").eq("post_id", row.id).eq("user_id", req.authUser.id).eq("kind", "save").maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const mappedProfile: any = profileLookup.get(profile.id) || {};
    return {
      id: row.id,
      userId: row.user_id,
      username: mappedProfile.username || profile.username,
      displayName: mappedProfile.display_name || profile.display_name || "VYBE user",
      avatarUrl: mappedProfile.avatar_url || null,
      caption: row.caption || "",
      media: [{ id: row.media_id || row.id, url: mediaUrl, type: row.media_type || "image" }],
      mediaUrl,
      mediaType: row.media_type || "image",
      visibility: row.visibility,
      createdAt: row.created_at,
      likeCount: likeCount || 0,
      commentCount: commentCount || 0,
      viewerHasLiked: Boolean(liked.data),
      viewerHasSaved: Boolean(saved.data),
    };
  }));
}

async function resolveMediaUrl(path: string) {
  try {
    const { data, error } = await getAdminSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(path, 86400);
    return !error && data?.signedUrl ? data.signedUrl : "";
  } catch {
    return "";
  }
}

export async function updateProfile(req: Express.Request, input: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  avatarMediaId?: string;
}) {
  const user = requireUser(req);
  const c = db(req);
  const values: Record<string, unknown> = {};

  if (input.displayName !== undefined) values.display_name = input.displayName;
  if (input.bio !== undefined) values.bio = input.bio;

  if (input.avatarMediaId !== undefined) {
    const { data: media, error } = await c.from("media")
      .select("id,storage_path,mime_type,media_type")
      .eq("id", input.avatarMediaId).eq("user_id", user.id).eq("media_type", "image").single();
    if (error || !media) throw new AppError(400, "AVATAR_MEDIA_NOT_FOUND", "Uploaded profile image not found.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(media.mime_type)) {
      throw new AppError(400, "INVALID_AVATAR_TYPE", "Profile images must be JPEG, PNG, or WebP.");
    }
    values.avatar_url = media.storage_path;
  } else if (input.avatarUrl !== undefined) {
    // Only allow clearing the avatar; arbitrary external URLs are not accepted for new writes.
    if (input.avatarUrl !== null) throw new AppError(400, "INVALID_AVATAR_URL", "Upload a profile image instead of providing an image URL.");
    values.avatar_url = null;
  }

  if (!Object.keys(values).length) throw new AppError(400, "EMPTY_PROFILE_UPDATE", "No profile changes were provided.");
  const { data, error } = await c.from("profiles").update(values).eq("id", user.id)
    .select("id,username,display_name,bio,avatar_url,created_at").single();
  if (error) throwDb(error);

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name || "",
    bio: data.bio || "",
    avatarUrl: await resolveAvatarUrl(data.avatar_url),
    createdAt: data.created_at,
  };
}


export async function getPreferences(req: Express.Request) {
  const user = requireUser(req);
  const { data, error } = await db(req).from("profiles").select("is_private,message_privacy").eq("id", user.id).single();
  if (error) throwDb(error);
  return { isPrivate: Boolean(data.is_private), messagePrivacy: data.message_privacy || "everyone" };
}

export async function updatePreferences(req: Express.Request, input: { isPrivate?: boolean; messagePrivacy?: "everyone" | "followers" | "nobody" }) {
  const user = requireUser(req);
  const values: Record<string, unknown> = {};
  if (input.isPrivate !== undefined) values.is_private = input.isPrivate;
  if (input.messagePrivacy !== undefined) values.message_privacy = input.messagePrivacy;
  if (!Object.keys(values).length) throw new AppError(400, "EMPTY_PREFERENCES", "Choose at least one preference to update.");
  const { data, error } = await db(req).from("profiles").update(values).eq("id", user.id).select("is_private,message_privacy").single();
  if (error) throwDb(error);
  return { isPrivate: Boolean(data.is_private), messagePrivacy: data.message_privacy || "everyone" };
}
