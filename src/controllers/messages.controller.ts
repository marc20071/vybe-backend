import { routeParam } from "../utils/route-param";
import type { Request, Response, NextFunction } from "express";
import * as messages from "../services/messages.service";

export async function conversations(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.conversations(req)); } catch (error) { next(error); }
}
export async function createConversation(req: Request, res: Response, next: NextFunction) {
  try { return res.status(201).json(await messages.createConversation(req, req.body.username)); } catch (error) { next(error); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.listMessages(req, routeParam(req, "id"))); } catch (error) { next(error); }
}
export async function send(req: Request, res: Response, next: NextFunction) {
  try { return res.status(201).json({ message: await messages.sendMessage(req, routeParam(req, "id"), req.body.body) }); } catch (error) { next(error); }
}

export async function createGroup(req: Request, res: Response, next: NextFunction) {
  try { return res.status(201).json(await messages.createGroup(req, req.body.name, req.body.usernames || [])); } catch (error) { next(error); }
}
export async function addMember(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.addGroupMember(req, routeParam(req, "id"), req.body.username)); } catch (error) { next(error); }
}
export async function deleteGroup(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.deleteGroup(req, routeParam(req, "id"))); } catch (error) { next(error); }
}
export async function clearHistory(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.clearHistory(req, routeParam(req, "id"))); } catch (error) { next(error); }
}
export async function leaveGroup(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.leaveGroup(req, routeParam(req, "id"))); } catch (error) { next(error); }
}
export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.deleteMessage(req, routeParam(req, "id"), routeParam(req, "messageId"))); } catch (error) { next(error); }
}
export async function react(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.toggleMessageReaction(req, routeParam(req, "id"), routeParam(req, "messageId"), req.body.emoji)); } catch (error) { next(error); }
}
export async function uploadAttachment(req: Request, res: Response, next: NextFunction) {
  try { const file = (req as Request & { file?: Express.Multer.File }).file; return res.status(201).json(await messages.uploadMessageAttachment(req, routeParam(req, "id"), file as Express.Multer.File)); } catch (error) { next(error); }
}
export async function sendAttachment(req: Request, res: Response, next: NextFunction) {
  try { return res.status(201).json({ message: await messages.sendAttachmentMessage(req, routeParam(req, "id"), req.body) }); } catch (error) { next(error); }
}
export async function signal(req: Request, res: Response, next: NextFunction) {
  try { return res.status(201).json(await messages.sendCallSignal(req, routeParam(req, "id"), req.body)); } catch (error) { next(error); }
}
export async function signals(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.receiveCallSignals(req, routeParam(req, "id"), typeof req.query.after === "string" ? req.query.after : undefined)); } catch (error) { next(error); }
}
export async function typing(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.setTyping(req, routeParam(req, "id"), Boolean(req.body.typing))); } catch (error) { next(error); }
}
export async function typingStatus(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.typingStatus(req, routeParam(req, "id"))); } catch (error) { next(error); }
}
export async function hideMessage(req: Request, res: Response, next: NextFunction) {
  try { return res.json(await messages.hideMessageForMe(req, routeParam(req, "id"), routeParam(req, "messageId"))); } catch (error) { next(error); }
}
