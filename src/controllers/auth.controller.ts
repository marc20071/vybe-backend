import type { Request, Response, NextFunction } from "express";
import * as auth from "../services/auth.service";
import { env } from "../config/env";
import { readToken } from "../middleware/authenticate";
import { getUserSupabase } from "../config/database";
import { profileMap } from "../services/shared";

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE === "true",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function publicUser(user: any, profile?: any) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: profile?.username || user.user_metadata?.username || "",
    displayName: profile?.display_name || user.user_metadata?.display_name || user.user_metadata?.displayName || "",
    avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || null,
    bio: profile?.bio || "",
    createdAt: profile?.created_at || user.created_at || null,
  };
}

function setSession(res: Response, session: any) {
  res.cookie("vybe_access_token", session.access_token, cookieOptions);
  res.cookie("vybe_refresh_token", session.refresh_token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await auth.signup(req.body);
    const emailConfirmed = Boolean(
  data.user?.email_confirmed_at || data.user?.confirmed_at
);
    if (data.session && emailConfirmed) setSession(res, data.session);
    return res.status(201).json({
      user: data.session && emailConfirmed ? publicUser(data.user) : null,
      needsEmailConfirmation: !emailConfirmed,
    });
  } catch (error) { next(error); }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await auth.login(req.body.email, req.body.password);
    setSession(res, data.session);
    return res.json({ user: publicUser(data.user) });
  } catch (error) { next(error); }
}

export async function me(req: Request, res: Response) {
  const token = readToken(req);
  if (!token) return res.json({ user: null });
  try {
    const user = await auth.getUser(token);
    const client = getUserSupabase(token);
    const profiles = await profileMap(client, [user.id]);
    const profile = profiles.get(user.id);
    return res.json({ user: publicUser(user, profile) });
  } catch {
    res.clearCookie("vybe_access_token", { path: "/" });
    res.clearCookie("vybe_refresh_token", { path: "/" });
    return res.json({ user: null });
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await auth.logout(readToken(req) || undefined);
    res.clearCookie("vybe_access_token", { path: "/" });
    res.clearCookie("vybe_refresh_token", { path: "/" });
    return res.status(204).end();
  } catch (error) { next(error); }
}

export async function resendConfirmation(req: Request, res: Response, next: NextFunction) {
  try {
    await auth.resendConfirmation(req.body.email);
    return res.status(204).end();
  } catch (error) { next(error); }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { error } = await (await import("../config/database")).getSupabase().auth.resetPasswordForEmail(req.body.email, { redirectTo: `${env.FRONTEND_URL}/reset-password` });
    if (error) throw error;
    return res.status(204).end();
  } catch (error) { next(error); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await auth.resetPassword(req.body.accessToken, req.body.password);
    return res.json({ success: true, userId: user.id });
  } catch (error) { next(error); }
}
