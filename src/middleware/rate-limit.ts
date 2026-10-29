import rateLimit from "express-rate-limit";import {env} from "../config/env";
export const apiRateLimit=rateLimit({windowMs:env.RATE_LIMIT_WINDOW_MS,limit:env.RATE_LIMIT_MAX,standardHeaders:"draft-8",legacyHeaders:false,message:{success:false,error:{code:"RATE_LIMITED",message:"Too many requests. Please try again later."}}});
export const authRateLimit=rateLimit({windowMs:900000,limit:30,standardHeaders:"draft-8",legacyHeaders:false});
