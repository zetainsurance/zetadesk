import { supabase } from "./supabaseClient";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, session: data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe?.();
}
