import type {SupabaseClient} from "@supabase/supabase-js";
export const commentsRepository={
 list(client:SupabaseClient,limit=20){return client.from("comments").select("id,post_id,user_id,body,created_at").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("comments").select("id,post_id,user_id,body,created_at").eq("id",id).maybeSingle()}
};
