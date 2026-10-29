
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Express } from "express";
import { AppError } from "../utils/app-error";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";

export function db(req: Express.Request): SupabaseClient {
  if (!req.supabase) {
    throw new AppError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Database is not configured."
    );
  }

  return req.supabase;
}

export function requireUser(req: Express.Request) {
  if (!req.authUser) {
    throw new AppError(
      401,
      "AUTH_REQUIRED",
      "Sign in to perform this action."
    );
  }

  return req.authUser;
}

export function throwDb(error: any): never {
  throw new AppError(
    400,
    error?.code || "DATABASE_ERROR",
    error?.message || "Database request failed."
  );
}

export async function profileMap(
  client: SupabaseClient,
  userIds: string[]
) {
  if (!userIds.length) {
    return new Map();
  }

  const { data, error } = await client
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .in("id", userIds);

  if (error) {
    throwDb(error);
  }

  const profiles = await Promise.all(
    (data || []).map(async (profile: any) => {
      let avatarUrl = profile.avatar_url;

      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        try {
          const { data: signedData, error: signedError } = await getAdminSupabase()
            .storage.from(MEDIA_BUCKET).createSignedUrl(avatarUrl, 86400);
          avatarUrl = !signedError && signedData?.signedUrl ? signedData.signedUrl : null;
        } catch {
          avatarUrl = null;
        }
      }

      return [
        profile.id,
        {
          ...profile,
          avatar_url: avatarUrl,
        },
      ] as const;
    })
  );

  return new Map(profiles);
}
