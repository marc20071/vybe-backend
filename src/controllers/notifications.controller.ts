import { routeParam } from "../utils/route-param";
import type {Request,Response,NextFunction} from "express";import * as notifications from "../services/notifications.service";
export async function list(req:Request,res:Response,next:NextFunction){try{return res.json(await notifications.listNotifications(req))}catch(e){next(e)}}
export async function markRead(req:Request,res:Response,next:NextFunction){try{await notifications.markRead(req,routeParam(req, "id"));return res.status(204).end()}catch(e){next(e)}}

export async function clear(req:Request,res:Response,next:NextFunction){try{await notifications.clearNotifications(req);return res.status(204).end()}catch(e){next(e)}}
