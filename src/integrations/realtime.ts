import { getUserSupabase } from "../config/database";
/** Returns a Supabase client configured with the authenticated user's token for realtime subscriptions. */
export function realtimeClient(accessToken:string){return getUserSupabase(accessToken)}
