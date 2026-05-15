import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export interface SottoProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  subscription_status: string;
  trial_started_at: string;
  total_words: number;
  total_sessions: number;
  streak_days: number;
  avg_wpm: number | null;
  preferred_model: string | null;
}

export async function getProfile(): Promise<SottoProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("sotto_profiles").select("*").eq("id", user.id).single();
  return data;
}

export async function saveTranscription(text: string, durationMs: number, wpm?: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("sotto_transcriptions").insert({ user_id: user.id, text, duration_ms: durationMs, wpm });
  // Update profile totals
  const words = text.split(/\s+/).filter(Boolean).length;
  await supabase.rpc("sotto_increment_words", { uid: user.id, word_count: words }).maybeSingle();
}
