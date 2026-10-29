import type {SupabaseClient} from "@supabase/supabase-js";
export const usersRepository={
 list(client:SupabaseClient,limit=20){return client.from("profiles").select("id,username,display_name,bio,avatar_url").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("profiles").select("id,username,display_name,bio,avatar_url").eq("id",id).maybeSingle()}
};
