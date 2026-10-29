import {z} from "zod";
export const signupSchema=z.object({email:z.email(),password:z.string().min(8).max(128),username:z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),displayName:z.string().trim().min(1).max(60)});
export const loginSchema=z.object({email:z.email(),password:z.string().min(1).max(128)});
