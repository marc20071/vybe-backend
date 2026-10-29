import "dotenv/config";
import { z } from "zod";
const schema = z.object({
 NODE_ENV:z.enum(["development","test","production"]).default("development"),
 PORT:z.coerce.number().int().positive().default(4000), FRONTEND_URL:z.string().url().default("http://localhost:3000"),
 API_BASE_PATH:z.string().default("/api"), SUPABASE_URL:z.string().url().optional().or(z.literal("")),
 SUPABASE_ANON_KEY:z.string().optional().default(""), SUPABASE_SERVICE_ROLE_KEY:z.string().optional().default(""),
 COOKIE_SECURE:z.enum(["true","false"]).default("false"), RATE_LIMIT_WINDOW_MS:z.coerce.number().positive().default(900000), RATE_LIMIT_MAX:z.coerce.number().positive().default(1200)
});
const result=schema.safeParse(process.env);
if(!result.success){console.error("Invalid environment configuration",result.error.flatten().fieldErrors);process.exit(1)}
export const env=result.data;
export const hasSupabase=Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
