import type { Request, RequestHandler } from "express";
import { getSupabase, getUserSupabase } from "../config/database";
import { fail } from "../utils/api-response";

export function readToken(req: Request): string {
  const authorization = req.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return req.cookies?.vybe_access_token || "";
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return fail(res, 401, "AUTH_REQUIRED", "Sign in to perform this action.");

  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data.user) {
      return fail(res, 401, "INVALID_TOKEN", "Your session is invalid or expired.");
    }

    req.authUser = data.user;
    req.accessToken = token;
    req.supabase = getUserSupabase(token);
    return next();
  } catch (error) {
    return next(error);
  }
};
