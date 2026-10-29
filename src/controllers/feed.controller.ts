import type {Request,Response,NextFunction} from "express";import {listFeed} from "../services/posts.service";
export async function feed(req:Request,res:Response,next:NextFunction){try{return res.json(await listFeed(req,false))}catch(e){next(e)}}
export async function following(req:Request,res:Response,next:NextFunction){try{return res.json(await listFeed(req,true))}catch(e){next(e)}}
