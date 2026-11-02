
import type { Request, Response, NextFunction } from "express";
import * as auth from "../services/auth.service";
import { env } from "../config/env";
import { readToken } from "../middleware/authenticate";
import { getUserSupabase } from "../config/database";
import { profileMap } from "../services/shared";

const ACCESS_COOKIE = "vybe_access_token";
const REFRESH_COOKIE = "vybe_refresh_token";

const isProduction = env.NODE_ENV === "production";

// Cross-site cookies require SameSite=None and Secure=true.
// Local HTTP development uses Lax cookies.
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
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

function preventCaching(res: Response): void {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
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
    createdAt: profile?.created_at || user.created_at || null,
  };
}

function setSessionCookies(res: Response, session: any): void {
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error(
      "Cannot create authentication cookies without a valid session."
    );
  }

  res.cookie(ACCESS_COOKIE, session.access_token, accessCookieOptions);
  res.cookie(REFRESH_COOKIE, session.refresh_token, refreshCookieOptions);
}

function clearSessionCookies(res: Response): void {
  // Cookie clearing must use matching path/domain/security attributes.
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

function sendUnauthenticated(res: Response): void {
  clearSessionCookies(res);

  res.status(200).json({
    user: null,
    authenticated: false,
  });
}

function isEmailConfirmed(user: any): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export async function signup(
  req: Request,
  res: Response,
  next: NextFunction
) {
  preventCaching(res);

  try {
    const data = await auth.signup(req.body);
    const emailConfirmed = isEmailConfirmed(data.user);
    const authenticated = Boolean(data.session && emailConfirmed);

    if (authenticated) {
      setSessionCookies(res, data.session);
    }

    return res.status(201).json({
      user: authenticated ? publicUser(data.user) : null,
      needsEmailConfirmation: !emailConfirmed,
      authenticated,
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
  preventCaching(res);

  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required.",
        },
      });
    }

    const data = await auth.login(email, password);

    if (
      !data.user ||
      !data.session?.access_token ||
      !data.session?.refresh_token
    ) {
      clearSessionCookies(res);

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
    return sendUnauthenticated(res);
  }

  try {
    const user = await auth.getUser(token);

    if (!user) {
      return sendUnauthenticated(res);
    }

    const client = getUserSupabase(token);
    const profiles = await profileMap(client, [user.id]);
    const profile = profiles.get(user.id);

    return res.status(200).json({
      user: publicUser(user, profile),
      authenticated: true,
    });
  } catch {
    // An expired or invalid access token is not an authenticated session.
    return sendUnauthenticated(res);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
) {
  preventCaching(res);

  try {
    const token = readToken(req);

    if (token) {
      try {
        await auth.logout(token);
      } catch (error) {
        // Clear local session cookies even if the remote logout fails.
        clearSessionCookies(res);
        return next(error);
      }
    }

    clearSessionCookies(res);
    return res.status(204).end();
  } catch (error) {
    clearSessionCookies(res);
    return next(error);
  }
}

export async function resendConfirmation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  preventCaching(res);

  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";

    if (!email) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Email is required.",
        },
      });
    }

    await auth.resendConfirmation(email);

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
  preventCaching(res);

  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";

    if (!email) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Email is required.",
        },
      });
    }

    const { error } = await getUserSupabase("").auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      }
    );

    if (error) {
      return next(error);
    }

    return res.status(200).json({
      success: true,
      message:
        "If an account exists for this email, a password reset link will be sent.",
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
  preventCaching(res);

  try {
    const accessToken =
      typeof req.body?.accessToken === "string"
        ? req.body.accessToken
        : "";
    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    if (!accessToken || !password) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Access token and password are required.",
        },
      });
    }

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
