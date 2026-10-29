import type {SupabaseClient} from "@supabase/supabase-js";
export const messagesRepository={
 list(client:SupabaseClient,limit=20){return client.from("messages").select("id,conversation_id,sender_id,body,created_at").limit(Math.min(Math.max(limit,1),50))},
 byId(client:SupabaseClient,id:string){return client.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("id",id).maybeSingle()}
};
