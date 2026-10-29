import type { User } from "@supabase/supabase-js";
declare global { namespace Express { interface Request { authUser?:User; accessToken?:string; cookies?: Record<string, string | undefined>; supabase?:import("@supabase/supabase-js").SupabaseClient } } }
export {};
