import { routeParam } from "../utils/route-param";
import type {Request,Response,NextFunction} from "express";import * as posts from "../services/posts.service";
export async function get(req:Request,res:Response,next:NextFunction){try{return res.json({post:await posts.getPost(req,routeParam(req, "id"))})}catch(e){next(e)}}
export async function create(req:Request,res:Response,next:NextFunction){try{return res.status(201).json({post:await posts.createPost(req,req.body)})}catch(e){next(e)}}
export async function remove(req:Request,res:Response,next:NextFunction){try{await posts.deletePost(req,routeParam(req, "id"));return res.status(204).end()}catch(e){next(e)}}

export async function saved(req:Request,res:Response,next:NextFunction){try{return res.json(await posts.listSavedPosts(req))}catch(e){next(e)}}
