import type {Request,Response,NextFunction} from "express";import {report} from "../services/moderation.service";
export async function create(req:Request,res:Response,next:NextFunction){try{return res.status(201).json({report:await report(req,req.body)})}catch(e){next(e)}}
