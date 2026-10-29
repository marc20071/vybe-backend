
import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";
import { AppError } from "../utils/app-error";

const PAGE_SIZE = 20;

/**
 * Read the cursor without relying on Express Request query/originalUrl typings.
 */
function getCursor(req: Express.Request): string {
  const requestWithQuery = req as unknown as {
    query?: {
      cursor?: unknown;
    };
  };

  const cursor = requestWithQuery.query?.cursor;
  return typeof cursor === "string" ? cursor : "";
}

async function removeBlockedAuthors(
  req: Express.Request,
  rows: any[],
) {
  if (!req.authUser || !rows.length) {
    return rows;
  }

  const { data, error } = await getAdminSupabase()
    .from("user_blocks")
    .select("blocker_id,blocked_id")
    .or(
      `blocker_id.eq.${req.authUser.id},blocked_id.eq.${req.authUser.id}`,
    );

  if (error) {
    throwDb(error);
  }

  const blocked = new Set<string>();

  for (const item of data || []) {
    blocked.add(String((item as any).blocker_id));
    blocked.add(String((item as any).blocked_id));
  }

  // Keep the current user's own posts, and remove posts from blocked users.
  return rows.filter(
    (row: any) =>
      String(row.user_id) === req.authUser!.id ||
      !blocked.has(String(row.user_id)),
  );
}

async function signedMediaUrl(
  value: string | null | undefined,
): Promise<string> {
  if (!value) {
    return "";
  }

  // Already a complete URL; do not try to sign it again.
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const { data, error } = await getAdminSupabase()
      .storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(value, 86400);

    return !error && data?.signedUrl ? data.signedUrl : "";
  } catch {
    return "";
  }
}

async function mapPost(
  req: Express.Request,
  row: any,
  profiles: Map<any, any>,
) {
  const client = db(req);
  const user = req.authUser;
  const profile = profiles.get(row.user_id) || {};

  const [
    mediaUrl,
    { count: likeCount },
    { count: commentCount },
    liked,
    saved,
  ] = await Promise.all([
    signedMediaUrl(row.media_url),

    client
      .from("reactions")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", row.id)
      .eq("kind", "like"),

    client
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", row.id),

    user
      ? client
          .from("reactions")
          .select("post_id")
          .eq("post_id", row.id)
          .eq("user_id", user.id)
          .eq("kind", "like")
          .maybeSingle()
      : Promise.resolve({ data: null }),

    user
      ? client
          .from("reactions")
          .select("post_id")
          .eq("post_id", row.id)
          .eq("user_id", user.id)
          .eq("kind", "save")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: row.id,
    userId: row.user_id,
    username: profile.username || "user",
    displayName: profile.display_name || "VYBE user",
    avatarUrl: profile.avatar_url || null,
    caption: row.caption || "",
    media: [
      {
        id: row.media_id || row.id,
        url: mediaUrl,
        type: row.media_type || "image",
      },
    ],
    mediaUrl,
    mediaType: row.media_type || "image",
    visibility: row.visibility,
    createdAt: row.created_at,
    likeCount: likeCount || 0,
    commentCount: commentCount || 0,
    viewerHasLiked: Boolean(liked.data),
    viewerHasSaved: Boolean(saved.data),
  };
}

export async function listFeed(
  req: Express.Request,
  following = false,
) {
  const client = db(req);
  const user = req.authUser;
  let followedIds: string[] = [];

  if (following) {
    if (!user) {
      throw new AppError(
        401,
        "AUTH_REQUIRED",
        "Sign in to see your following feed.",
      );
    }

    const { data, error } = await client
      .from("follows")
      .select("followed_id")
      .eq("follower_id", user.id);

    if (error) {
      throwDb(error);
    }

    followedIds = (data || []).map(
      (item: any) => String(item.followed_id),
    );

    if (!followedIds.length) {
      return { items: [], nextCursor: null };
    }
  }

  let query = client
    .from("posts")
    .select(
      "id,user_id,media_id,caption,media_url,media_type,visibility,created_at",
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (following) {
    query = query.in("user_id", followedIds);
  }

  const cursor = getCursor(req);

  if (cursor && !Number.isNaN(Date.parse(cursor))) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    throwDb(error);
  }

  const rows = await removeBlockedAuthors(req, data || []);

  const profiles = await profileMap(
    client,
    [
      ...new Set<string>(
        rows.map((row: any) => String(row.user_id)),
      ),
    ],
  );

  const items = await Promise.all(
    rows.map((row: any) => mapPost(req, row, profiles)),
  );

  const nextCursor =
    rows.length === PAGE_SIZE
      ? rows[rows.length - 1].created_at
      : null;

  return { items, nextCursor };
}

export async function getPost(
  req: Express.Request,
  id: string,
) {
  const client = db(req);

  const { data, error } = await client
    .from("posts")
    .select(
      "id,user_id,media_id,caption,media_url,media_type,visibility,created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throwDb(error);
  }

  if (!data || data.visibility !== "public") {
    throw new AppError(404, "POST_NOT_FOUND", "Post not found.");
  }

  if (req.authUser && data.user_id !== req.authUser.id) {
    const { data: blocks, error: blockError } =
      await getAdminSupabase()
        .from("user_blocks")
        .select("blocker_id,blocked_id")
        .or(
          `and(blocker_id.eq.${req.authUser.id},blocked_id.eq.${data.user_id}),and(blocker_id.eq.${data.user_id},blocked_id.eq.${req.authUser.id})`,
        )
        .limit(1);

    if (blockError) {
      throwDb(blockError);
    }

    if (blocks?.length) {
      throw new AppError(
        404,
        "POST_NOT_FOUND",
        "Post not found.",
      );
    }
  }

  const profiles = await profileMap(client, [data.user_id]);

  return mapPost(req, data, profiles);
}

export async function createPost(
  req: Express.Request,
  input: any,
) {
  const user = requireUser(req);
  const client = db(req);

  if (!input.mediaId) {
    throw new AppError(
      400,
      "MEDIA_REQUIRED",
      "Upload a photo or video before publishing.",
    );
  }

  const { data: media, error: mediaError } = await client
    .from("media")
    .select("id,storage_path,public_url,media_type,user_id")
    .eq("id", input.mediaId)
    .eq("user_id", user.id)
    .single();

  if (mediaError || !media) {
    throw new AppError(
      400,
      "MEDIA_NOT_FOUND",
      "Uploaded media was not found. Please upload it again.",
    );
  }

  const { data, error } = await client
    .from("posts")
    .insert({
      user_id: user.id,
      caption:
        typeof input.caption === "string"
          ? input.caption.trim()
          : "",
      media_id: input.mediaId,
      media_url: media.public_url || media.storage_path,
      media_type: media.media_type,
      visibility: input.visibility || "public",
    })
    .select(
      "id,user_id,media_id,caption,media_url,media_type,visibility,created_at",
    )
    .single();

  if (error) {
    throwDb(error);
  }

  const profiles = await profileMap(client, [user.id]);

  return mapPost(req, data, profiles);
}

export async function deletePost(
  req: Express.Request,
  id: string,
) {
  const user = requireUser(req);

  const { error, count } = await db(req)
    .from("posts")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throwDb(error);
  }

  if (count === 0) {
    throw new AppError(
      404,
      "POST_NOT_FOUND",
      "Post not found or you cannot delete it.",
    );
  }
}

export async function listSavedPosts(req: Express.Request) {
  const user = requireUser(req);
  const client = db(req);

  const { data: reactions, error } = await client
    .from("reactions")
    .select("post_id,created_at")
    .eq("user_id", user.id)
    .eq("kind", "save")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throwDb(error);
  }

  const ids = (reactions || []).map(
    (item: any) => String(item.post_id),
  );

  if (!ids.length) {
    return { items: [] };
  }

  const { data: rows, error: postError } = await client
    .from("posts")
    .select(
      "id,user_id,media_id,caption,media_url,media_type,visibility,created_at",
    )
    .in("id", ids)
    .eq("visibility", "public");

  if (postError) {
    throwDb(postError);
  }

  const byId = new Map(
    (rows || []).map((row: any) => [row.id, row]),
  );

  const orderedRows = ids
    .map((postId: string) => byId.get(postId))
    .filter(Boolean);

  const profiles = await profileMap(
    client,
    [
      ...new Set<string>(
        orderedRows.map((row: any) => String(row.user_id)),
      ),
    ],
  );

  return {
    items: await Promise.all(
      orderedRows.map((row: any) =>
        mapPost(req, row, profiles),
      ),
    ),
  };
}
