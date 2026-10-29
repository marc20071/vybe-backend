import { routeParam } from "../utils/route-param";
import type {Request,Response,NextFunction} from "express";import {setReaction} from "../services/reactions.service";
export async function like(req:Request,res:Response,next:NextFunction){try{return res.json(await setReaction(req,routeParam(req, "id"),"like",req.method==="PUT"))}catch(e){next(e)}}
export async function save(req:Request,res:Response,next:NextFunction){try{await setReaction(req,routeParam(req, "id"),"save",req.method==="PUT");return res.status(204).end()}catch(e){next(e)}}
