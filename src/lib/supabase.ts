import { createClient } from '@supabase/supabase-js';

/**
 * Ein Client für beide Kontexte: Build-Zeit (Astro-Frontmatter, Node) und
 * Browser (Admin-Bereich). Vite/Astro ersetzt PUBLIC_*-Variablen in beiden
 * Fällen zur Build-Zeit. Der anon-Key ist bewusst öffentlich, siehe
 * supabase/schema.sql für das eigentliche Sicherheitsmodell (RLS + die
 * beiden öffentlichen Views, auf die anon allein Zugriff hat).
 */
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Die Verbindung zu Supabase fehlt: PUBLIC_SUPABASE_URL und/oder PUBLIC_SUPABASE_ANON_KEY sind nicht gesetzt.\n' +
      'Lokal: beide Werte in die Datei .env eintragen (Vorlage: .env.example).\n' +
      'Auf Vercel: Settings → Environment Variables, danach einmal neu deployen.\n' +
      'Ohne diese Werte kann der Build weder Workshops noch Lehmhäuser laden.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
