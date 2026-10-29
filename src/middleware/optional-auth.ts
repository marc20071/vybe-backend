import type { RequestHandler } from "express";
import { getSupabase, getUserSupabase } from "../config/database";
import { hasSupabase } from "../config/env";
import { readToken } from "./authenticate";

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (!hasSupabase) return next();
  const token = readToken(req);

  try {
    if (token) {
      const { data, error } = await getSupabase().auth.getUser(token);
      if (!error && data.user) {
        req.authUser = data.user;
        req.accessToken = token;
        req.supabase = getUserSupabase(token);
        return next();
      }
    }
    // Public feed, stories, and profile pages still need an anonymous Supabase client.
    req.supabase = getSupabase();
    return next();
  } catch (error) {
    return next(error);
  }
};
