import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { AppError } from "../utils/app-error";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";

export type StoryInput = {
  type: "text" | "image" | "video";
  mediaId?: string;
  text?: string;
  textStyle?: Record<string, unknown>;
  visibility?: "public" | "followers" | "private";
  music?: { provider: string; trackId: string; title: string; artist: string; audioUrl: string; licenseUrl?: string | null; imageUrl?: string | null; startSeconds?: number; durationSeconds?: number };
  originalAudioMuted?: boolean;
  musicVolume?: number;
  originalVolume?: number;
};

async function signedMediaUrl(path: string | null | undefined) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  try {
    const { data, error } = await getAdminSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    return !error && data?.signedUrl ? data.signedUrl : "";
  } catch { return ""; }
}

function mapStory(row: any, profile: any, mediaUrl: string) {
  return {
    id: row.id, userId: row.user_id, username: profile?.username || "user",
    displayName: profile?.display_name || "VYBE user", avatarUrl: profile?.avatar_url || null,
    type: row.story_type || (row.media_url?.match(/\.(mp4|webm)(\?|$)/i) ? "video" : "image"),
    mediaUrl, text: row.text_content || "", textStyle: row.text_style || {},
    music: row.music_track_id ? { provider: row.music_provider, trackId: row.music_track_id, title: row.music_title, artist: row.music_artist, audioUrl: row.music_audio_url, licenseUrl: row.music_license_url || null, imageUrl: row.music_image_url || null, startSeconds: row.music_start_seconds || 0, durationSeconds: row.music_duration_seconds || 15 } : null,
    originalAudioMuted: Boolean(row.original_audio_muted), musicVolume: Number(row.music_volume ?? 0.8), originalVolume: Number(row.original_volume ?? 1),
    visibility: row.visibility || "public", createdAt: row.created_at, expiresAt: row.expires_at,
  };
}

export async function listStories(req: Express.Request) {
  const c = db(req);
  const { data, error } = await c.from("stories").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
  if (error) throwDb(error);
  let rows = data || [];
  const viewerId = req.authUser?.id;
  if (viewerId) {
    const admin = getAdminSupabase();
    const [{ data: blockRows, error: blockError }, { data: followingRows, error: followError }] = await Promise.all([
      admin.from("user_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
      c.from("follows").select("followed_id").eq("follower_id", viewerId),
    ]);
    if (blockError) throwDb(blockError); if (followError) throwDb(followError);
    const blocked = new Set<string>();
    for (const b of blockRows || []) { blocked.add(String((b as any).blocker_id)); blocked.add(String((b as any).blocked_id)); }
    const following = new Set<string>((followingRows || []).map((x: any) => String(x.followed_id)));
    rows = rows.filter((row: any) => {
      if (String(row.user_id) !== viewerId && blocked.has(String(row.user_id))) return false;
      const visibility = row.visibility || "public";
      return String(row.user_id) === viewerId || visibility === "public" || (visibility === "followers" && following.has(String(row.user_id)));
    });
  } else {
    rows = rows.filter((row: any) => (row.visibility || "public") === "public");
  }
  const ids = [...new Set<string>(rows.map((x: any) => String(x.user_id)))];
  const ps = await profileMap(c, ids);
  const items = await Promise.all(rows.map(async (row: any) => {
    const profile: any = ps.get(row.user_id);
    const mediaUrl = await signedMediaUrl(row.media_url);
    let likeCount = 0; let viewerHasLiked = false;
    const { count, error: countError } = await c.from("story_likes").select("user_id", { count: "exact", head: true }).eq("story_id", row.id);
    if (!countError) likeCount = count || 0;
    if (req.authUser) {
      const { data: liked } = await c.from("story_likes").select("story_id").eq("story_id", row.id).eq("user_id", req.authUser.id).maybeSingle();
      viewerHasLiked = Boolean(liked);
    }
    return { ...mapStory(row, profile, mediaUrl), likeCount, viewerHasLiked };
  }));
  return { items };
}

export async function createStory(req: Express.Request, input: StoryInput) {
  const u = requireUser(req); const c = db(req);
  const text = (input.text || "").trim();
  if (input.type === "text" && !text) throw new AppError(400, "STORY_TEXT_REQUIRED", "Write something before publishing a text story.");
  if (input.type !== "text" && !input.mediaId) throw new AppError(400, "STORY_MEDIA_REQUIRED", "Choose an image or video first.");
  if (text.length > 1000) throw new AppError(400, "STORY_TEXT_TOO_LONG", "Story text must be 1,000 characters or fewer.");
  let media: any = null;
  if (input.mediaId) {
    const { data, error } = await c.from("media").select("id,storage_path,public_url,user_id,media_type,mime_type").eq("id", input.mediaId).eq("user_id", u.id).maybeSingle();
    if (error) throwDb(error);
    if (!data) throw new AppError(400, "MEDIA_NOT_FOUND", "Uploaded media was not found.");
    if ((input.type === "image" && data.media_type !== "image") || (input.type === "video" && data.media_type !== "video")) throw new AppError(400, "STORY_MEDIA_TYPE_MISMATCH", "The selected file does not match the Story type.");
    media = data;
  }
  const music = input.music;
  if (music) {
    let audioHost = ""; try { audioHost = new URL(music.audioUrl).hostname; } catch { /* validated below */ }
    if (music.provider !== "jamendo" || !music.trackId || !/^https:\/\//i.test(music.audioUrl) || !(audioHost === "jamendo.com" || audioHost.endsWith(".jamendo.com"))) throw new AppError(400, "INVALID_STORY_MUSIC", "Choose a valid track from the connected music catalog.");
  }
  const payload: Record<string, unknown> = {
    user_id: u.id, media_id: media?.id || null, media_url: media?.public_url || media?.storage_path || null,
    story_type: input.type, text_content: text, text_style: input.textStyle || {}, visibility: input.visibility || "public",
    music_provider: music?.provider || null, music_track_id: music?.trackId || null, music_title: music?.title || null, music_artist: music?.artist || null, music_audio_url: music?.audioUrl || null,
    music_license_url: music?.licenseUrl || null, music_image_url: music?.imageUrl || null,
    music_start_seconds: Math.max(0, Math.floor(music?.startSeconds || 0)), music_duration_seconds: Math.min(60, Math.max(1, Math.floor(music?.durationSeconds || 15))),
    original_audio_muted: Boolean(input.originalAudioMuted), music_volume: Math.min(1, Math.max(0, input.musicVolume ?? 0.8)), original_volume: Math.min(1, Math.max(0, input.originalVolume ?? 1)),
  };
  const { data, error } = await c.from("stories").insert(payload).select("*").single();
  if (error) throwDb(error);
  const profile = (await profileMap(c, [u.id])).get(u.id) as any;
  return { ...mapStory(data, profile, await signedMediaUrl(data.media_url)), likeCount: 0, viewerHasLiked: false };
}

export async function updateStory(req: Express.Request, id: string, input: Partial<StoryInput>) {
  const u = requireUser(req); const c = db(req);
  const { data: existing, error: getError } = await c.from("stories").select("*").eq("id", id).eq("user_id", u.id).maybeSingle();
  if (getError) throwDb(getError);
  if (!existing) throw new AppError(404, "STORY_NOT_FOUND", "Story not found or you do not own it.");
  const values: Record<string, unknown> = {};
  if (input.text !== undefined) { if (input.text.length > 1000) throw new AppError(400, "STORY_TEXT_TOO_LONG", "Story text must be 1,000 characters or fewer."); values.text_content = input.text.trim(); }
  if (input.textStyle !== undefined) values.text_style = input.textStyle;
  if (input.visibility !== undefined) values.visibility = input.visibility;
  if (input.originalAudioMuted !== undefined) values.original_audio_muted = input.originalAudioMuted;
  if (input.musicVolume !== undefined) values.music_volume = Math.min(1, Math.max(0, input.musicVolume));
  if (input.originalVolume !== undefined) values.original_volume = Math.min(1, Math.max(0, input.originalVolume));
  if (input.music) {
    let audioHost = ""; try { audioHost = new URL(input.music.audioUrl).hostname; } catch { /* validated below */ }
    if (input.music.provider !== "jamendo" || !(audioHost === "jamendo.com" || audioHost.endsWith(".jamendo.com"))) throw new AppError(400, "INVALID_STORY_MUSIC", "Choose a valid track from the connected music catalog.");
  }
  if (input.music !== undefined) {
    values.music_provider = input.music?.provider || null; values.music_track_id = input.music?.trackId || null; values.music_title = input.music?.title || null; values.music_artist = input.music?.artist || null; values.music_audio_url = input.music?.audioUrl || null; values.music_license_url = input.music?.licenseUrl || null; values.music_image_url = input.music?.imageUrl || null; values.music_start_seconds = input.music?.startSeconds || 0; values.music_duration_seconds = input.music?.durationSeconds || 15;
  }
  if (!Object.keys(values).length) throw new AppError(400, "EMPTY_STORY_UPDATE", "Choose something to update.");
  const { data, error } = await c.from("stories").update(values).eq("id", id).eq("user_id", u.id).select("*").single();
  if (error) throwDb(error);
  const profile = (await profileMap(c, [u.id])).get(u.id) as any;
  return mapStory(data, profile, await signedMediaUrl(data.media_url));
}

export async function deleteStory(req: Express.Request, id: string) {
  const u = requireUser(req); const c = db(req);
  const { data, error } = await c.from("stories").delete().eq("id", id).eq("user_id", u.id).select("id").maybeSingle();
  if (error) throwDb(error);
  if (!data) throw new AppError(404, "STORY_NOT_FOUND", "Story not found or you do not own it.");
}

export async function viewStory(req: Express.Request, id: string) {
  const user = requireUser(req); const c = db(req);
  const { data, error } = await c.from("stories").select("id,user_id").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throwDb(error);
  if (!data) throw new AppError(404, "STORY_NOT_FOUND", "Story not found.");
  const { error: viewError } = await c.from("story_views").upsert({ story_id: id, viewer_id: user.id, viewed_at: new Date().toISOString() }, { onConflict: "story_id,viewer_id" });
  if (viewError) throwDb(viewError);
}

export async function likeStory(req: Express.Request, id: string, active: boolean) {
  const user = requireUser(req); const c = db(req);
  const { data: story, error: storyError } = await c.from("stories").select("id,user_id").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (storyError) throwDb(storyError); if (!story) throw new AppError(404, "STORY_NOT_FOUND", "Story not found.");
  if (story.user_id !== user.id) { const { data: blockRows, error: blockError } = await getAdminSupabase().from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${user.id},blocked_id.eq.${story.user_id}),and(blocker_id.eq.${story.user_id},blocked_id.eq.${user.id})`).limit(1); if (blockError) throwDb(blockError); if (blockRows?.length) throw new AppError(403, "USER_BLOCKED", "You cannot interact with this story."); }
  const { data: existingLike, error: existingLikeError } = await c.from("story_likes").select("user_id").eq("story_id", id).eq("user_id", user.id).maybeSingle();
  if (existingLikeError) throwDb(existingLikeError);
  if (active) {
    const { error } = await c.from("story_likes").upsert({ story_id: id, user_id: user.id }, { onConflict: "story_id,user_id" }); if (error) throwDb(error);
    if (!existingLike && story.user_id !== user.id) { try { const p: any = (await profileMap(c, [user.id])).get(user.id); await getAdminSupabase().from("notifications").insert({ user_id: story.user_id, actor_id: user.id, type: "story_like", message: `@${p?.username || "someone"} liked your Story.` }); } catch { /* Notification delivery must not undo a like. */ } }
  } else { const { error } = await c.from("story_likes").delete().eq("story_id", id).eq("user_id", user.id); if (error) throwDb(error); }
  const { count } = await c.from("story_likes").select("user_id", { count: "exact", head: true }).eq("story_id", id);
  return { liked: active, likeCount: count || 0 };
}

export async function listStoryComments(req: Express.Request, id: string) {
  const c = db(req); const { data: story, error: storyError } = await c.from("stories").select("id").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (storyError) throwDb(storyError); if (!story) throw new AppError(404, "STORY_NOT_FOUND", "Story not found.");
  const { data, error } = await c.from("story_comments").select("id,story_id,user_id,body,created_at").eq("story_id", id).order("created_at", { ascending: true }).limit(100);
  if (error) throwDb(error); const rows = data || []; const profiles = await profileMap(c, [...new Set<string>(rows.map((x: any) => String(x.user_id)))]);
  return { items: rows.map((x: any) => { const p: any = profiles.get(x.user_id); return { id: x.id, storyId: x.story_id, userId: x.user_id, username: p?.username || "user", displayName: p?.display_name || p?.username || "VYBE user", avatarUrl: p?.avatar_url || null, body: x.body, createdAt: x.created_at }; }) };
}

export async function createStoryComment(req: Express.Request, id: string, body: string) {
  const user = requireUser(req); const c = db(req); const clean = body.trim();
  if (!clean || clean.length > 1000) throw new AppError(400, "INVALID_COMMENT", "Comments must be between 1 and 1,000 characters.");
  const { data: story, error: storyError } = await c.from("stories").select("id,user_id").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (storyError) throwDb(storyError); if (!story) throw new AppError(404, "STORY_NOT_FOUND", "Story not found.");
  if (story.user_id !== user.id) { const { data: blockRows, error: blockError } = await getAdminSupabase().from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${user.id},blocked_id.eq.${story.user_id}),and(blocker_id.eq.${story.user_id},blocked_id.eq.${user.id})`).limit(1); if (blockError) throwDb(blockError); if (blockRows?.length) throw new AppError(403, "USER_BLOCKED", "You cannot interact with this story."); }
  const { data, error } = await c.from("story_comments").insert({ story_id: id, user_id: user.id, body: clean }).select().single(); if (error) throwDb(error);
  const p: any = (await profileMap(c, [user.id])).get(user.id);
  if (story.user_id !== user.id) { try { await getAdminSupabase().from("notifications").insert({ user_id: story.user_id, actor_id: user.id, type: "story_comment", message: `@${p?.username || "someone"} replied to your story.` }); } catch { /* keep comment available even if notification delivery fails */ } }
  return { id: data.id, storyId: id, userId: user.id, username: p?.username || "user", displayName: p?.display_name || p?.username || "VYBE user", avatarUrl: p?.avatar_url || null, body: data.body, createdAt: data.created_at };
}

export async function listStoryViews(req: Express.Request, id: string) {
  const user = requireUser(req); const c = db(req);
  const { data: story, error: storyError } = await c.from("stories").select("id,user_id").eq("id", id).maybeSingle(); if (storyError) throwDb(storyError);
  if (!story) throw new AppError(404, "STORY_NOT_FOUND", "Story not found."); if (story.user_id !== user.id) throw new AppError(403, "STORY_VIEWS_FOR_OWNER_ONLY", "Only the story owner can view the viewer list.");
  const { data, error } = await c.from("story_views").select("viewer_id,viewed_at").eq("story_id", id).order("viewed_at", { ascending: false }).limit(500); if (error) throwDb(error);
  const rows = data || []; const profiles = await profileMap(c, [...new Set<string>(rows.map((x: any) => String(x.viewer_id)))]);
  return { items: rows.map((x: any) => { const p: any = profiles.get(x.viewer_id); return { userId: x.viewer_id, username: p?.username || "user", displayName: p?.display_name || p?.username || "VYBE user", avatarUrl: p?.avatar_url || null, viewedAt: x.viewed_at }; }) };
}

export async function searchMusic(query: string) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new AppError(503, "MUSIC_CATALOG_NOT_CONFIGURED", "Music search is not configured yet. Add JAMENDO_CLIENT_ID to the backend environment to enable licensed catalog search.");
  const q = query.trim(); if (q.length < 2) return { items: [] };
  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.search = new URLSearchParams({ client_id: clientId, format: "json", limit: "20", search: q, audioformat: "mp31", include: "musicinfo" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new AppError(502, "MUSIC_PROVIDER_ERROR", "The music catalog is temporarily unavailable.");
  const payload: any = await response.json();
  if (payload?.headers?.status !== "success") throw new AppError(502, "MUSIC_PROVIDER_ERROR", "The music provider could not complete the search.");
  return { items: (payload.results || []).filter((track: any) => track.audio).map((track: any) => ({ provider: "jamendo", trackId: String(track.id), title: String(track.name || "Untitled"), artist: String(track.artist_name || "Unknown artist"), audioUrl: String(track.audio), durationSeconds: Number(track.duration || 0), licenseUrl: track.license_ccurl || null, imageUrl: track.album_image || track.image || null })) };
}
