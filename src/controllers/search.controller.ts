import type {Request,Response,NextFunction} from "express";import {search} from "../services/search.service";
export async function run(req:Request,res:Response,next:NextFunction){try{return res.json(await search(req,String(req.query.q||"")))}catch(e){next(e)}}
