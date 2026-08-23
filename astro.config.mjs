import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import cspErgaenzen from './src/integrations/csp-ergaenzen.mjs';

// Die CSP weiter unten muss dieselbe Supabase-Adresse kennen wie der Client
// in src/lib/supabase.ts (img-src für Fotos, connect-src für die API).
// Diese Datei läuft aber, bevor Vite die .env-Datei in `process.env`
// einliest -- ein einfaches `process.env.PUBLIC_SUPABASE_URL` wäre hier
// lokal immer leer, obwohl `npm run dev` sonst ganz normal funktioniert.
// `loadEnv` ist der von Astro/Vite dafür vorgesehene Weg, .env schon in der
// Config zu lesen; Werte aus der echten Umgebung (z. B. Vercel-Build) haben
// weiterhin Vorrang vor der Datei.
const env = loadEnv(process.env.NODE_ENV || '', process.cwd(), 'PUBLIC_');
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;

// Fehlt die Adresse, wird sie unten aus img-src/connect-src weggelassen --
// nicht hart abgebrochen. Ein Abbruch schon beim Laden der Konfiguration
// wuerde `npm run dev` und `npm run preview` fuer jeden frischen Klon
// killen, bevor die deutlich bessere Erklaerung aus src/lib/supabase.ts
// ueberhaupt zu Wort kommt. Und eine CSP ohne Supabase-Adresse kann nie
// live gehen: derselbe fehlende Wert laesst jeden echten Build schon an
// src/lib/supabase.ts scheitern.
if (!supabaseUrl) {
  console.warn(
    '[csp] PUBLIC_SUPABASE_URL fehlt -- img-src/connect-src werden ohne die ' +
      'Supabase-Adresse gebaut. Fuer einen echten Build in .env eintragen ' +
      '(Vorlage .env.example), auf Vercel unter Settings -> Environment Variables.',
  );
}

/** Quellenliste ohne leere Eintraege, falls die Adresse fehlt. */
const mitSupabase = (...quellen) => quellen.filter(Boolean).join(' ');

// https://astro.build/config
export default defineConfig({
  site: 'https://retoniosdeleden.com',
  // Schliesst die zwei Luecken, die Astros CSP offen laesst: Hashes fuer
  // die is:inline-Skripte (die hasht Astro nicht mit) und style-src-attr
  // fuer die style-Attribute. Ohne beides bricht die Seite unter der CSP --
  // die Datei erklaert das Warum im Detail.
  integrations: [cspErgaenzen()],
  // Astro liest PORT nicht von sich aus. Wird die Umgebungsvariable gesetzt
  // (z. B. weil der Standardport schon belegt ist), soll der Dev-Server sie
  // trotzdem übernehmen — sonst bleibt es bei 4321.
  server: {
    port: Number(process.env.PORT) || 4321,
  },
  // Die Travesía (der Übergang zur Buchseite) spielt rund 640 ms Animation
  // und navigiert dann. Ist die Zielseite bis dahin nicht da, sieht man die
  // Lücke. `hover` lädt sie schon beim Zeigen vor — beim Klick liegt sie
  // meist im Cache und der Übergang ist lückenlos. Nur markierte Links,
  // damit nicht die halbe Seite vorgeladen wird.
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  redirects: {
    '/': '/es/',
  },
  // Content-Security-Policy pro Seite (PLAN-SICHERHEIT.md, Befund B5).
  // Astro berechnet für jede Seite die Hashes ihrer eigenen Inline-Skripte
  // und schreibt sie automatisch in ein <meta>-Tag im <head> -- von Hand
  // wäre das kaum zu pflegen, weil sich die Hashes mit jedem Build ändern.
  // script-src bleibt dadurch bei 'self' plus Hashes, ganz ohne
  // 'unsafe-inline' (geprüft im gebauten dist/admin/index.html).
  //
  // Zwei Direktiven aus dem Zielbild fehlen hier absichtlich: frame-ancestors
  // und form-action wirken in einem per <meta> ausgelieferten CSP nicht --
  // Browser ignorieren sie dort (nur ein echter HTTP-Header kann sie
  // durchsetzen). Beide stehen deshalb stattdessen in vercel.json; sie hier
  // zusätzlich hinzuschreiben wäre nur totes Markup.
  experimental: {
    csp: {
      // style-src deckt Astros eigene, gehashte <style>-Tags und die
      // externen Stylesheets ab. 'unsafe-inline' steht hier bewusst NICHT:
      // Astro traegt in diese Direktive immer eine Hash-Quelle ein, und
      // sobald eine Hash-Quelle darin steht, ignorieren Browser
      // 'unsafe-inline' fuer die gesamte Direktive. Die echten
      // style="..."-Attribute regelt stattdessen style-src-attr, angehaengt
      // von src/integrations/csp-ergaenzen.mjs.
      styleDirective: {
        resources: ["'self'"],
      },
      directives: [
        "default-src 'self'",
        `img-src ${mitSupabase("'self'", 'data:', 'blob:', supabaseUrl)}`,
        "font-src 'self'",
        `connect-src ${mitSupabase("'self'", supabaseUrl)}`,
        "base-uri 'self'",
        "object-src 'none'",
      ],
    },
  },
});
