import {z} from "zod";export const commentSchema=z.object({body:z.string().trim().min(1).max(2000)});
