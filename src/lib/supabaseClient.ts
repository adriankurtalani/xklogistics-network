import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

declare global {
  // eslint-disable-next-line no-var
  var supabaseClient: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.supabaseClient ?? createClient(supabaseUrl, supabaseAnonKey);

if (!globalThis.supabaseClient) {
  globalThis.supabaseClient = supabase;
}

