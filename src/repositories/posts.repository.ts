import type {SupabaseClient} from "@supabase/supabase-js";
export const postsRepository={
 list(client:SupabaseClient,limit=20){return client.from("posts").select("id,user_id,caption,media_url,media_type,visibility,created_at").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("posts").select("id,user_id,caption,media_url,media_type,visibility,created_at").eq("id",id).maybeSingle()}
};
