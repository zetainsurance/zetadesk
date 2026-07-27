import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// A single shared client. Auth session persists in the browser so a
// signed-in teammate stays signed in across refreshes.
export const supabase = createClient(url || "", key || "", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const supabaseConfigured = Boolean(url && key);
