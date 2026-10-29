import { routeParam } from "../utils/route-param";
import type { Request, Response, NextFunction } from "express";
import * as users from "../services/users.service";
import * as follows from "../services/follows.service";
import * as blocks from "../services/blocks.service";

export async function profile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await users.getProfile(req, routeParam(req, "username"));
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.json({ user });
  } catch (error) { next(error); }
}

export async function profilePosts(req: Request, res: Response, next: NextFunction) {
  try { return res.json({ items: await users.listProfilePosts(req, routeParam(req, "username")) }); }
  catch (error) { next(error); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try { return res.json({ user: await users.updateProfile(req, req.body) }); }
  catch (error) { next(error); }
}

export async function followStatus(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await follows.followStatus(req, routeParam(req, "username"))); }
  catch (error) { next(error); }
}
export async function follow(req: Request, res: Response, next: NextFunction) {
  try { const result = await follows.setFollow(req, routeParam(req, "username"), true); return res.json(result || { following: true }); }
  catch (error) { next(error); }
}
export async function unfollow(req: Request, res: Response, next: NextFunction) {
  try { const result = await follows.setFollow(req, routeParam(req, "username"), false); return res.json(result || { following: false }); }
  catch (error) { next(error); }
}

export async function block(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await blocks.blockUser(req, routeParam(req, "username"))); } catch (error) { next(error); }
}
export async function unblock(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await blocks.unblockUser(req, routeParam(req, "username"))); } catch (error) { next(error); }
}
export async function blockList(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await blocks.listBlockedUsers(req)); } catch (error) { next(error); }
}

export async function preferences(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await users.getPreferences(req)); } catch (error) { next(error); }
}
export async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await users.updatePreferences(req, req.body)); } catch (error) { next(error); }
}

export async function followRequests(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await follows.listFollowRequests(req)); } catch (error) { next(error); }
}
export async function approveFollowRequest(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await follows.respondFollowRequest(req, routeParam(req, "id"), true)); } catch (error) { next(error); }
}
export async function rejectFollowRequest(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await follows.respondFollowRequest(req, routeParam(req, "id"), false)); } catch (error) { next(error); }
}
