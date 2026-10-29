import { getSupabase, getUserSupabase, getAdminSupabase } from "../config/database";
import { env } from "../config/env";
import { AppError } from "../utils/app-error";

export async function signup(input: { email: string; password: string; username: string; displayName: string }) {
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username: input.username.toLowerCase(), display_name: input.displayName.trim() }, emailRedirectTo: `${env.FRONTEND_URL}/login?confirmed=1` },
  });
  if (error) throw new AppError(400, "SIGNUP_FAILED", error.message);
  if (!data.user) throw new AppError(400, "SIGNUP_FAILED", "Could not create account.");
  // Supabase may return an empty identities array for an existing email to prevent account enumeration.
  // Only create/update the profile when this response represents a newly-created identity.
  if ((data.user.identities?.length ?? 1) > 0 || data.session) {
    const { error: profileError } = await getAdminSupabase().from("profiles").upsert({
      id: data.user.id,
      username: input.username.toLowerCase(),
      display_name: input.displayName.trim(),
    }, { onConflict: "id" });
    if (profileError) throw new AppError(400, "PROFILE_CREATE_FAILED", profileError.message);
  }
  return data;
}

export async function login(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    const message = error?.message?.toLowerCase().includes("email not confirmed")
      ? "Please confirm your email address before signing in. Check your inbox for the confirmation link."
      : error?.message || "Invalid login credentials.";
    throw new AppError(401, "LOGIN_FAILED", message);
  }
  return data;
}

export async function getUser(token: string) {
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) throw new AppError(401, "AUTH_REQUIRED", "Not signed in.");
  return data.user;
}

export async function resendConfirmation(email: string) {
  const { error } = await getSupabase().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${env.FRONTEND_URL}/login?confirmed=1` } });
  if (error) throw new AppError(400, "CONFIRMATION_RESEND_FAILED", error.message);
}

export async function logout(token?: string) {
  if (!token) return;
  const { error } = await getUserSupabase(token).auth.signOut();
  if (error) throw new AppError(400, "LOGOUT_FAILED", error.message);
}

export async function resetPassword(accessToken: string, password: string) {
  const { data: authData, error: authError } = await getSupabase().auth.getUser(accessToken);
  if (authError || !authData.user) throw new AppError(401, "INVALID_RESET_LINK", "This password reset link is invalid or has expired.");
  const { data, error } = await getAdminSupabase().auth.admin.updateUserById(authData.user.id, { password });
  if (error || !data.user) throw new AppError(400, "PASSWORD_RESET_FAILED", error?.message || "Could not update your password.");
  return data.user;
}
