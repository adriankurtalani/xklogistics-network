import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Log clearly in Vercel Function logs without crashing the module
  console.error(
    '[Supabase] Missing environment variables: ' +
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in Vercel → Settings → Environment Variables, then redeployed.'
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

