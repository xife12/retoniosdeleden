import { createClient } from '@supabase/supabase-js';

/**
 * Ein Client für beide Kontexte: Build-Zeit (Astro-Frontmatter, Node) und
 * Browser (Admin-Bereich). Vite/Astro ersetzt PUBLIC_*-Variablen in beiden
 * Fällen zur Build-Zeit. Der anon-Key ist bewusst öffentlich, siehe
 * supabase/schema.sql für das eigentliche Sicherheitsmodell (RLS).
 */
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'PUBLIC_SUPABASE_URL und PUBLIC_SUPABASE_ANON_KEY fehlen. Lokal in .env eintragen (siehe .env.example), im Deploy als Vercel-Projekt-Umgebungsvariablen.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
