import type {RequestHandler} from "express";import type {ZodType} from "zod";
export function validateBody(schema:ZodType):RequestHandler{return(req,_res,next)=>{const r=schema.safeParse(req.body);if(!r.success)return next(r.error);req.body=r.data;return next()}}
