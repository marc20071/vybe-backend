import type {RequestHandler} from "express";import {fail} from "../utils/api-response";
export const notFound:RequestHandler=(req,res)=>fail(res,404,"ROUTE_NOT_FOUND",`No route found for ${req.method} ${req.path}`);
