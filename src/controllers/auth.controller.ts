
import type { Request, Response, NextFunction } from "express";
import * as auth from "../services/auth.service";
import { env } from "../config/env";
import { readToken } from "../middleware/authenticate";
import { getUserSupabase } from "../config/database";
import { profileMap } from "../services/shared";

const ACCESS_COOKIE = "vybe_access_token";
const REFRESH_COOKIE = "vybe_refresh_token";

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE === "true",
  sameSite: "lax" as const,
  path: "/",
};

const accessCookieOptions = {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const refreshCookieOptions = {
  ...cookieOptions,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function preventCaching(res: Response) {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
  });
}

function publicUser(user: any, profile?: any) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username:
      profile?.username ||
      user.user_metadata?.username ||
      "",
    displayName:
      profile?.display_name ||
      user.user_metadata?.display_name ||
      user.user_metadata?.displayName ||
      "",
    avatarUrl:
      profile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      null,
    bio: profile?.bio || "",
    createdAt:
      profile?.created_at ||
      user.created_at ||
      null,
  };
}

function setSessionCookies(res: Response, session: any) {
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("Cannot create authentication cookies without a valid session.");
  }

  res.cookie(ACCESS_COOKIE, session.access_token, accessCookieOptions);
  res.cookie(REFRESH_COOKIE, session.refresh_token, refreshCookieOptions);
}

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

export async function signup(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    const data = await auth.signup(req.body);

    const emailConfirmed = Boolean(
      data.user?.email_confirmed_at ||
      data.user?.confirmed_at
    );

    if (data.session && emailConfirmed) {
      setSessionCookies(res, data.session);
    }

    return res.status(201).json({
      user:
        data.session && emailConfirmed
          ? publicUser(data.user)
          : null,
      needsEmailConfirmation: !emailConfirmed,
      authenticated: Boolean(data.session && emailConfirmed),
    });
  } catch (error) {
    return next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    const data = await auth.login(
      req.body.email,
      req.body.password
    );

    if (
      !data.session?.access_token ||
      !data.session?.refresh_token
    ) {
      return res.status(401).json({
        error: {
          code: "LOGIN_FAILED",
          message: "Could not establish an authentication session.",
        },
      });
    }

    setSessionCookies(res, data.session);

    return res.status(200).json({
      user: publicUser(data.user),
      authenticated: true,
    });
  } catch (error) {
    return next(error);
  }
}

export async function me(req: Request, res: Response) {
  preventCaching(res);

  const token = readToken(req);

  if (!token) {
    return res.status(200).json({
      user: null,
      authenticated: false,
    });
  }

  try {
    const user = await auth.getUser(token);

    const client = getUserSupabase(token);
    const profiles = await profileMap(client, [user.id]);
    const profile = profiles.get(user.id);

    return res.status(200).json({
      user: publicUser(user, profile),
      authenticated: true,
    });
  } catch {
    clearSessionCookies(res);

    return res.status(200).json({
      user: null,
      authenticated: false,
    });
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    const token = readToken(req);

    if (token) {
      await auth.logout(token);
    }

    clearSessionCookies(res);

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function resendConfirmation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    await auth.resendConfirmation(req.body.email);

    return res.status(200).json({
      success: true,
      message: "Confirmation email sent. Please check your inbox.",
    });
  } catch (error) {
    return next(error);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    const { error } = await getUserSupabase("").auth.resetPasswordForEmail(
      req.body.email,
      {
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      }
    );

    if (error) {
      return next(error);
    }

    return res.status(200).json({
      success: true,
      message: "If an account exists for this email, a password reset link will be sent.",
    });
  } catch (error) {
    return next(error);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    preventCaching(res);

    const { accessToken, password } = req.body;

    const user = await auth.resetPassword(accessToken, password);

    return res.status(200).json({
      success: true,
      message: "Your password has been updated successfully.",
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
}
