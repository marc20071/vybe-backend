import type { Express } from "express";
import { db, throwDb, profileMap } from "./shared";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";

async function signedUrl(value: string | null | undefined) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const { data, error } = await getAdminSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(value, 86400);
    return !error && data?.signedUrl ? data.signedUrl : "";
  } catch { return ""; }
}

export async function search(req: Express.Request, q: string) {
  const c = db(req);
  const term = q.trim().replace(/[,%()]/g, " ").slice(0, 80);
  if (!term) return { users: [], posts: [], hashtags: [] };

  const [{ data: prefixRows, error: prefixError }, { data: fuzzyRows, error: fuzzyError }, { data: postRows, error: postError }] = await Promise.all([
    c.from("profile_search_stats").select("id,username,display_name,bio,avatar_url,created_at,follower_count,following_count,post_count").ilike("username", `${term}%`).order("username", { ascending: true }).limit(20),
    c.from("profile_search_stats").select("id,username,display_name,bio,avatar_url,created_at,follower_count,following_count,post_count").or(`username.ilike.%${term}%,display_name.ilike.%${term}%`).order("username", { ascending: true }).limit(30),
    c.from("posts").select("id,user_id,media_id,caption,media_url,media_type,visibility,created_at").eq("visibility", "public").ilike("caption", `%${term}%`).order("created_at", { ascending: false }).limit(10),
  ]);
  if (prefixError) throwDb(prefixError);
  if (fuzzyError) throwDb(fuzzyError);
  if (postError) throwDb(postError);
  const seenUsers = new Set<string>();
  const userRows = [...(prefixRows || []), ...(fuzzyRows || [])].filter((row: any) => { if (seenUsers.has(row.id)) return false; seenUsers.add(row.id); return true; }).slice(0, 12);
  const users = await Promise.all(userRows.map(async (row: any) => ({
    id: row.id, username: row.username, displayName: row.display_name || "", bio: row.bio || "", avatarUrl: await signedUrl(row.avatar_url), createdAt: row.created_at,
    followerCount: Number(row.follower_count || 0), followingCount: Number(row.following_count || 0), postCount: Number(row.post_count || 0),
  })));

  const rows = postRows || [];
  const profiles = await profileMap(c, [...new Set<string>(rows.map((row: any) => String(row.user_id)))]);
  const posts = await Promise.all(rows.map(async (row: any) => {
    const profile: any = profiles.get(row.user_id) || {};
    const [{ count: likeCount }, { count: commentCount }] = await Promise.all([
      c.from("reactions").select("post_id", { count: "exact", head: true }).eq("post_id", row.id).eq("kind", "like"),
      c.from("comments").select("id", { count: "exact", head: true }).eq("post_id", row.id),
    ]);
    const mediaUrl = await signedUrl(row.media_url);
    return {
      id: row.id, userId: row.user_id, username: profile.username || "user",
      displayName: profile.display_name || "VYBE user", avatarUrl: profile.avatar_url || null,
      caption: row.caption || "", media: [{ id: row.media_id || row.id, url: mediaUrl, type: row.media_type || "image" }],
      mediaUrl, mediaType: row.media_type || "image", visibility: row.visibility, createdAt: row.created_at,
      likeCount: likeCount || 0, commentCount: commentCount || 0, viewerHasLiked: false, viewerHasSaved: false,
    };
  }));

  return { users, posts, hashtags: [...new Set((term.match(/[\w]+/g) || []).map((word: string) => `#${word}`))] };
}
