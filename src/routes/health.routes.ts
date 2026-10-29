import {Router} from "express";import {hasSupabase} from "../config/env";
const r=Router();r.get("/",(_req,res)=>res.json({status:"ok",service:"vybe-backend",timestamp:new Date().toISOString(),supabaseConfigured:hasSupabase}));export default r;
