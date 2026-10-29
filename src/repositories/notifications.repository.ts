import type {SupabaseClient} from "@supabase/supabase-js";
export const notificationsRepository={
 list(client:SupabaseClient,limit=20){return client.from("notifications").select("id,user_id,actor_id,type,message,read_at,created_at").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("notifications").select("id,user_id,actor_id,type,message,read_at,created_at").eq("id",id).maybeSingle()}
};
