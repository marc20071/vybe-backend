import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "./env";
let anonClient:SupabaseClient|null=null;
let adminClient:SupabaseClient|null=null;
export function getSupabase():SupabaseClient {
 if(!hasSupabase) throw Object.assign(new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY."),{statusCode:503,code:"DATABASE_NOT_CONFIGURED"});
 if(!anonClient) anonClient=createClient(env.SUPABASE_URL!,env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return anonClient;
}
export function getAdminSupabase():SupabaseClient {
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) throw Object.assign(new Error("Supabase admin credentials are not configured."),{statusCode:503,code:"ADMIN_DATABASE_NOT_CONFIGURED"});
 if(!adminClient) adminClient=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return adminClient;
}
export function getUserSupabase(accessToken:string):SupabaseClient {
 const client=getSupabase();
 return createClient(env.SUPABASE_URL!,env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${accessToken}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
