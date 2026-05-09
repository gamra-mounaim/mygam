import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Robust validation
  const isValidUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (!isValidUrl(supabaseUrl) || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined') {
    return null;
  }

  try {
    supabaseInstance = createClient(supabaseUrl!, supabaseAnonKey!);
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

// Remove the top-level export that calls getSupabase() immediately
// to prevent crashes during module import.
