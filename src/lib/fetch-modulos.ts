import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import {
  modulos as modulosDeCodigo,
  type Mes,
  type Modulo,
  type ModuloEstado,
  type ModuloLugar,
  type ModuloTexto,
} from '../data/modulos';

/**
 * Liest die veröffentlichten Schulmodule zur Bauzeit aus Supabase.
 *
 * Quelle ist ausschließlich die View `modulos_public` -- sie liefert den
 * veröffentlichten Schnappschuss (`published_payload`), nie den Arbeitsstand
 * aus dem Backend. Dadurch landen Zwischenstände des Autospeicherns niemals
 * auf der Website. Siehe supabase/migrations/006_modulos.sql.
 *
 * ---------------------------------------------------------------------------
 * Warum diese Datei nachgiebiger ist als fetch-workshops.ts
 * ---------------------------------------------------------------------------
 * fetch-workshops.ts wirft, wenn die Datenbank nicht antwortet -- und das ist
 * dort richtig: ohne Datenbank gibt es keine Talleres, eine leere Seite wäre
 * schlimmer als ein abgebrochener Build.
 *
 * Bei den Módulos ist die Lage eine andere. Es gibt sie doppelt: in der
 * Datenbank UND als vollständigen, gepflegten Satz in src/data/modulos.ts.
 * Diese Datei ist deshalb bewusst als Übergang gebaut -- der Bereich "Las
 * abejas educan" soll auch dann stehen, wenn
 *
 *   * 006_modulos.sql noch nicht eingespielt ist (die View fehlt),
 *   * die Zugangsdaten fehlen (kein PUBLIC_SUPABASE_URL, etwa in einem
 *     frischen Checkout oder in einer Vorschau-Umgebung ohne Secrets),
 *   * die vier Module in der Datenbank stehen, aber noch niemand sie
 *     veröffentlicht hat.
 *
 * In allen drei Fällen greift der Satz aus src/data/modulos.ts. Der Build
 * bleibt nie stehen, und die Website zeigt in keinem Fall eine leere Ruta.
 * Was passiert ist, steht als Warnung im Buildprotokoll -- stillschweigend
 * auf Ersatzdaten auszuweichen wäre die Art Freundlichkeit, die einen Monat
 * später niemand mehr versteht.
 *
 * Sobald die Module in der Datenbank stehen und veröffentlicht sind, gewinnt
 * immer die Datenbank. src/data/modulos.ts bleibt danach das, was es laut
 * seinem eigenen Kopfkommentar sein soll: Typen und Rückfalldaten.
 */

/** Textfelder je Sprache, so wie sie im Backend gespeichert werden. */
interface ModuloTranslationRow {
  title: string;
  clase: string;
  /** Ein bis zwei Sätze auf der Karte. */
  summary: string;
  /** Der lange Text hinter "Leer más". */
  longDesc: string;
  objetivos: string[];
}

interface ModuloPublicRow {
  /** Entspricht `Modulo.id` -- der Wert steht im Anfrageformular. */
  slug: string;
  numero: number;
  lugar: ModuloLugar;
  estado: ModuloEstado;
  edad_min: number;
  /** null heißt "offen nach oben" ("ab 8"), siehe Migration 006. */
  edad_max: number | null;
  /** Minuten, nicht Stunden. */
  duracion: number;
  max_alumnos: number;
  meses: number[];
  translations: Partial<Record<Lang, ModuloTranslationRow>>;
  sort_order: number;
}

/**
 * Fehlt eine Sprache, greift die andere als Notnagel -- dieselbe Regel wie
 * bei den Talleres: ein halb übersetztes Modul soll den Build nicht anhalten,
 * eine leere Karte wäre schlimmer als eine spanische Karte auf der englischen
 * Seite.
 *
 * Fehlen BEIDE, wird hier -- anders als bei den Talleres -- nicht geworfen,
 * sondern `null` zurückgegeben; der Aufrufer nimmt dann den ganzen Satz aus
 * src/data/modulos.ts. Begründung siehe Kopfkommentar.
 */
function pickTranslation(row: ModuloPublicRow, lang: Lang): ModuloTranslationRow | null {
  return row.translations?.[lang] ?? row.translations?.[lang === 'es' ? 'en' : 'es'] ?? null;
}

function toModuloTexto(row: ModuloTranslationRow): ModuloTexto {
  return {
    title: row.title ?? '',
    summary: row.summary ?? '',
    longDesc: row.longDesc ?? '',
    objetivos: Array.isArray(row.objetivos) ? row.objetivos : [],
    clase: row.clase ?? '',
  };
}

/**
 * Monate aus dem jsonb-Array in die enge `Mes`-Form bringen.
 *
 * Die Datenbank prüft dasselbe bereits (`modulos_meses_check`); hier wird es
 * ein zweites Mal gefiltert, weil `published_payload` ein Schnappschuss ist:
 * er wurde zu dem Zeitpunkt geschrieben, als die damalige Prüfung galt, und
 * niemand garantiert, dass die Prüfung seither unverändert geblieben ist. Ein
 * unmöglicher Monat würde sonst als Zahl bis in die Monatsleiste der Karte
 * durchlaufen.
 */
function toMeses(value: unknown): Mes[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (n): n is Mes => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12,
  );
}

function toModulo(row: ModuloPublicRow): Modulo | null {
  const es = pickTranslation(row, 'es');
  const en = pickTranslation(row, 'en');
  if (!es || !en) {
    console.warn(
      `[modulos] Das Modul "${row.slug}" hat im veröffentlichten Stand keine Texte. ` +
        'Im Backend unter /admin ausfüllen und neu veröffentlichen.',
    );
    return null;
  }

  return {
    id: row.slug,
    numero: Number(row.numero) || 0,
    lugar: row.lugar,
    estado: row.estado,
    edadMin: Number(row.edad_min) || 0,
    // Bewusst nur setzen, wenn es einen Wert gibt: `edadMax: undefined` und
    // "kein edadMax" sind für die Filterlogik dasselbe, aber ein `edadMax: 0`
    // wäre etwas ganz anderes -- nämlich "höchstens null Jahre alt".
    ...(row.edad_max === null || row.edad_max === undefined
      ? {}
      : { edadMax: Number(row.edad_max) }),
    duracion: Number(row.duracion) || 0,
    maxAlumnos: Number(row.max_alumnos) || 0,
    meses: toMeses(row.meses),
    text: { es: toModuloTexto(es), en: toModuloTexto(en) },
  };
}

/**
 * Der Supabase-Client, aber ohne den Build mitzureißen.
 *
 * src/lib/supabase.ts wirft schon beim Import, wenn PUBLIC_SUPABASE_URL oder
 * PUBLIC_SUPABASE_ANON_KEY fehlen. Ein gewöhnliches `import` oben in dieser
 * Datei würde diesen Fehler also auslösen, bevor irgendein Rückfall greifen
 * könnte -- deshalb hier ein dynamisches Import innerhalb von try/catch.
 */
async function loadClient(): Promise<SupabaseClient | null> {
  try {
    const mod = await import('./supabase');
    return mod.supabase;
  } catch (err) {
    console.warn(
      '[modulos] Keine Verbindung zu Supabase konfiguriert — es gelten die ' +
        'Module aus src/data/modulos.ts.\n' +
        `Meldung: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Nur veröffentlichte Module, in der im Backend gesetzten Reihenfolge.
 * Kommt nichts Brauchbares zurück, gilt der Satz aus src/data/modulos.ts.
 */
export async function fetchModulos(): Promise<Modulo[]> {
  const client = await loadClient();
  if (!client) return modulosDeCodigo;

  const { data, error } = await client
    .from('modulos_public')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn(
      '[modulos] Die Module konnten nicht aus Supabase geladen werden — es ' +
        'gelten die Module aus src/data/modulos.ts.\n' +
        `Meldung der Datenbank: ${error.message}\n` +
        'Häufigste Ursache: supabase/migrations/006_modulos.sql ist noch nicht ' +
        'eingespielt. Dann fehlt die View "modulos_public".',
    );
    return modulosDeCodigo;
  }

  const rows = ((data ?? []) as ModuloPublicRow[])
    .map(toModulo)
    .filter((m): m is Modulo => m !== null);

  if (rows.length === 0) {
    console.warn(
      '[modulos] In "modulos_public" steht kein veröffentlichtes Modul — es ' +
        'gelten die Module aus src/data/modulos.ts.\n' +
        'Im Backend unter /admin → Módulos die Module öffnen und auf ' +
        '"Publicar" tippen.',
    );
    return modulosDeCodigo;
  }

  return rows;
}
