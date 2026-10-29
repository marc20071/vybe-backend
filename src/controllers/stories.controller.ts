import { routeParam } from "../utils/route-param";
import type { Request, Response, NextFunction } from "express";
import * as stories from "../services/stories.service";
export async function list(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.listStories(req)); } catch (e) { next(e); } }
export async function create(req: Request, res: Response, next: NextFunction) { try { return res.status(201).json({ story: await stories.createStory(req, req.body) }); } catch (e) { next(e); } }
export async function update(req: Request, res: Response, next: NextFunction) { try { return res.json({ story: await stories.updateStory(req, routeParam(req, "id"), req.body) }); } catch (e) { next(e); } }
export async function remove(req: Request, res: Response, next: NextFunction) { try { await stories.deleteStory(req, routeParam(req, "id")); return res.status(204).end(); } catch (e) { next(e); } }
export async function view(req: Request, res: Response, next: NextFunction) { try { await stories.viewStory(req, routeParam(req, "id")); return res.status(204).end(); } catch (e) { next(e); } }
export async function like(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.likeStory(req, routeParam(req, "id"), true)); } catch (e) { next(e); } }
export async function unlike(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.likeStory(req, routeParam(req, "id"), false)); } catch (e) { next(e); } }
export async function listComments(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.listStoryComments(req, routeParam(req, "id"))); } catch (e) { next(e); } }
export async function comment(req: Request, res: Response, next: NextFunction) { try { return res.status(201).json({ comment: await stories.createStoryComment(req, routeParam(req, "id"), req.body.body) }); } catch (e) { next(e); } }
export async function views(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.listStoryViews(req, routeParam(req, "id"))); } catch (e) { next(e); } }
export async function musicSearch(req: Request, res: Response, next: NextFunction) { try { return res.json(await stories.searchMusic(String(req.query.q || ""))); } catch (e) { next(e); } }
