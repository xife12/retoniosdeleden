import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://retonos-del-eden.vercel.app',
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
});
