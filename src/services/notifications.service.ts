import type { Express } from "express";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { AppError } from "../utils/app-error";
import { getAdminSupabase } from "../config/database";

export async function listNotifications(req: Express.Request) {
  const user = requireUser(req);
  const c = db(req);
  const { data, error } = await c.from("notifications").select("id,type,actor_id,message,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) throwDb(error);
  const rows = data || [];
  const profiles = await profileMap(c, [...new Set<string>(rows.map((row: any) => row.actor_id).filter(Boolean).map((id: any) => String(id)))]);
  return { items: rows.map((row: any) => ({ id: row.id, type: row.type, actorUsername: (profiles.get(row.actor_id) as any)?.username || "", message: row.message, createdAt: row.created_at, readAt: row.read_at })) };
}

export async function markRead(req: Express.Request, id: string) {
  const user = requireUser(req);
  const { data, error } = await db(req).from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) throwDb(error);
  if (!data) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
}

export async function clearNotifications(req: Express.Request) {
  const user = requireUser(req);
  const { error } = await getAdminSupabase().from("notifications").delete().eq("user_id", user.id);
  if (error) throwDb(error);
  return { cleared: true };
}
