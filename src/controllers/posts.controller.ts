
import { routeParam } from "../utils/route-param";
import type { Request, Response, NextFunction } from "express";
import * as posts from "../services/posts.service";

export async function get(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json({
      post: await posts.getPost(req, routeParam(req, "id")),
    });
  } catch (error) {
    return next(error);
  }
}

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.status(201).json({
      post: await posts.createPost(req, req.body),
    });
  } catch (error) {
    return next(error);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await posts.deletePost(req, routeParam(req, "id"));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function saved(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(await posts.listSavedPosts(req));
  } catch (error) {
    return next(error);
  }
}

export async function view(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(
      await posts.recordPostView(req, routeParam(req, "id")),
    );
  } catch (error) {
    return next(error);
  }
}

export async function repost(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(
      await posts.setRepost(req, routeParam(req, "id"), true),
    );
  } catch (error) {
    return next(error);
  }
}

export async function undoRepost(
  req: Request,
  res: Response,
    next: NextFunction,
) {
  try {
    return res.json(
      await posts.setRepost(req, routeParam(req, "id"), false),
    );
  } catch (error) {
    return next(error);
  }
}
