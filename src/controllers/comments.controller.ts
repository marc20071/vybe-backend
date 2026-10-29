import { routeParam } from "../utils/route-param";
import type {Request,Response,NextFunction} from "express";import * as comments from "../services/comments.service";
export async function list(req:Request,res:Response,next:NextFunction){try{return res.json(await comments.listComments(req,routeParam(req, "id")))}catch(e){next(e)}}
export async function create(req:Request,res:Response,next:NextFunction){try{return res.status(201).json({comment:await comments.createComment(req,routeParam(req, "id"),req.body.body)})}catch(e){next(e)}}
