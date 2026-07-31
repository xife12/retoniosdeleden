/**
 * Erzeugt die Vorlese-Dateien für „Luna y el secreto de la colmena".
 *
 * Warum überhaupt: Die Sprachausgabe des Browsers (Web Speech API) klingt auf
 * den meisten Geräten blechern, und daran lässt sich von der Website aus
 * nichts ändern — die Stimme kommt vom Betriebssystem. Deshalb erzeugen wir
 * die Erzählung EINMAL mit einer guten Stimme und legen fertige MP3s ins
 * Projekt. Zur Laufzeit entstehen dadurch keine Kosten und keine Wartezeit.
 *
 * Jeder Satz wird eine eigene Datei. Das hat drei Vorteile: das Mitlesen kann
 * satzweise mitlaufen, das Anhalten reagiert sofort, und beim Nachbessern
 * eines einzelnen Satzes muss nicht die ganze Seite neu erzeugt werden.
 *
 * ------------------------------------------------------------------
 * Einrichtung (einmalig)
 * ------------------------------------------------------------------
 *  1. Konto bei ElevenLabs anlegen und einen API-Schlüssel erzeugen.
 *  2. Im Projektwurzelverzeichnis eine Datei `.env` anlegen:
 *
 *       ELEVENLABS_API_KEY=dein_schluessel
 *       ELEVENLABS_VOICE_ID=id_der_gewaehlten_stimme
 *
 *     Die Stimme suchst du dir in der Voice Library aus — such nach einer
 *     spanischen Frauenstimme, warm und ruhig; „Rioplatense" oder
 *     „Latin American" passt zum Buch. Die ID steht in den Stimmendetails.
 *  3. `npm run voz` ausführen.
 *
 * Die `.env` gehört NICHT ins Repository. Sie steht bereits in `.gitignore`.
 *
 * ------------------------------------------------------------------
 * Aufrufe
 * ------------------------------------------------------------------
 *   npm run voz              nur fehlende Dateien erzeugen
 *   npm run voz -- --force   alles neu erzeugen
 *   npm run voz -- --seite 3 nur Seite 3
 *   npm run voz -- --dry     nichts erzeugen, nur zeigen was anfiele
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(raiz, 'public', 'voz', 'es');
const MANIFIESTO = join(raiz, 'public', 'voz', 'manifest.json');

const MODELO = 'eleven_multilingual_v2';
const AJUSTES = {
  // Etwas Variation, damit nicht jeder Satz gleich klingt, aber nicht so viel,
  // dass die Stimme von Seite zu Seite die Farbe wechselt.
  stability: 0.42,
  similarity_boost: 0.8,
  style: 0.35,
  use_speaker_boost: true,
};

/* ---------- kleine Helfer ---------- */

const args = process.argv.slice(2);
const tiene = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const FORZAR = tiene('--force');
const SECO = tiene('--dry');
const SOLO = valor('--seite') ?? valor('--pagina');

async function existe(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Liest .env ohne zusätzliche Abhängigkeit. */
async function cargarEnv() {
  const ruta = join(raiz, '.env');
  if (!(await existe(ruta))) return;
  const texto = await readFile(ruta, 'utf8');
  for (const linea of texto.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i < 0) continue;
    const clave = limpia.slice(0, i).trim();
    const val = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[clave]) process.env[clave] = val;
  }
}

/**
 * Satzzerlegung.
 *
 * Bewusst eine eigene, einfache Kopie und kein Import aus `src/scripts/voz.ts`:
 * Node müsste dafür TypeScript auflösen. Die Aufteilung muss auch gar nicht
 * mit der Laufzeit übereinstimmen — was gilt, steht hinterher im Manifest.
 */
function partir(texto) {
  const FIN = '.!?…';
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const out = [];
  let actual = '';

  for (let i = 0; i < limpio.length; i += 1) {
    actual += limpio[i];
    if (FIN.indexOf(limpio[i]) >= 0 && limpio[i + 1] === ' ') {
      const t = actual.trim();
      if (t) out.push(t);
      actual = '';
      i += 1;
    }
  }
  const resto = actual.trim();
  if (resto) out.push(resto);
  return out;
}

/* ---------- Erzeugung ---------- */

async function hablar(texto, clave, vozId) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vozId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': clave,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: texto, model_id: MODELO, voice_settings: AJUSTES }),
    }
  );

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`ElevenLabs ${r.status}: ${detalle.slice(0, 300)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  await cargarEnv();

  const narracion = JSON.parse(await readFile(join(raiz, 'src', 'data', 'narracion.json'), 'utf8'));
  const paginas = Object.keys(narracion)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .filter((k) => !SOLO || k === String(SOLO));

  const clave = process.env.ELEVENLABS_API_KEY;
  const vozId = process.env.ELEVENLABS_VOICE_ID;

  // Erst zeigen, was anfällt — auch ohne Schlüssel.
  const plan = paginas.map((n) => ({ n, frases: partir(narracion[n]) }));
  const letras = plan.reduce((s, p) => s + p.frases.reduce((t, f) => t + f.length, 0), 0);
  const archivos = plan.reduce((s, p) => s + p.frases.length, 0);

  console.log(`\n  ${plan.length} Seiten · ${archivos} Sätze · ${letras} Zeichen\n`);

  if (SECO) {
    for (const p of plan) {
      console.log(`  Seite ${p.n}`);
      p.frases.forEach((f, i) => console.log(`    ${String(i + 1).padStart(2, '0')}  ${f}`));
    }
    console.log('\n  Probelauf — nichts erzeugt.\n');
    return;
  }

  if (!clave || !vozId) {
    console.error(
      '  Es fehlt ELEVENLABS_API_KEY oder ELEVENLABS_VOICE_ID in der .env.\n' +
        '  Ohne die beiden kann ich nichts erzeugen. Die Website fällt so lange\n' +
        '  automatisch auf die Browserstimme zurück — sie funktioniert, klingt\n' +
        '  nur schlechter.\n\n' +
        '  Mit `npm run voz -- --dry` siehst du vorher, was erzeugt würde.\n'
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(SALIDA, { recursive: true });

  const manifiesto = { version: 1, generado: new Date().toISOString(), paginas: {} };
  let creados = 0;
  let saltados = 0;

  for (const { n, frases } of plan) {
    manifiesto.paginas[n] = [];
    for (let i = 0; i < frases.length; i += 1) {
      const nombre = `p${String(n).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}.mp3`;
      const destino = join(SALIDA, nombre);
      const entrada = { texto: frases[i], archivo: `/voz/es/${nombre}` };
      manifiesto.paginas[n].push(entrada);

      if (!FORZAR && (await existe(destino))) {
        saltados += 1;
        continue;
      }

      process.stdout.write(`  ${nombre}  ${frases[i].slice(0, 52)}… `);
      const audio = await hablar(frases[i], clave, vozId);
      await writeFile(destino, audio);
      creados += 1;
      console.log(`${(audio.length / 1024).toFixed(0)} KB`);

      // Höflich gegenüber der API bleiben.
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  // Beim Einzelseiten-Lauf das bestehende Manifest nicht wegwerfen.
  if (SOLO && (await existe(MANIFIESTO))) {
    const viejo = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
    manifiesto.paginas = { ...viejo.paginas, ...manifiesto.paginas };
  }

  await writeFile(MANIFIESTO, JSON.stringify(manifiesto, null, 2));
  console.log(`\n  Fertig. ${creados} neu, ${saltados} übersprungen.\n`);
}

main().catch((e) => {
  console.error(`\n  Abgebrochen: ${e.message}\n`);
  process.exitCode = 1;
});
