import type {SupabaseClient} from "@supabase/supabase-js";
export const followsRepository={
 list(client:SupabaseClient,limit=20){return client.from("follows").select("follower_id,followed_id,created_at").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("follows").select("follower_id,followed_id,created_at").eq("id",id).maybeSingle()}
};
