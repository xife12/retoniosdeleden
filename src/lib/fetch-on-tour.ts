import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import type { WorkshopCurrency } from '../data/workshops';
import {
  seminarios as seminariosDeCodigo,
  zonas as zonasDeCodigo,
  type PrecioTipo,
  type Seminario,
  type SeminarioTexto,
  type Zona,
} from '../data/on-tour';

/**
 * Liest die veröffentlichten On-Tour-Daten zur Bauzeit aus Supabase.
 *
 * Quelle sind ausschließlich die Views `on_tour_seminarios_public` und
 * `on_tour_zonas_public` -- sie liefern den veröffentlichten Schnappschuss
 * (`published_payload`), nie den Arbeitsstand aus dem Backend. Dadurch landen
 * Zwischenstände des Autospeicherns niemals auf der Website. Siehe
 * supabase/migrations/008_on_tour.sql.
 *
 * ---------------------------------------------------------------------------
 * Warum diese Datei nachgiebiger ist als fetch-workshops.ts
 * ---------------------------------------------------------------------------
 * Wortgleich dieselbe Überlegung wie in fetch-modulos.ts: fetch-workshops.ts
 * wirft, wenn die Datenbank nicht antwortet, weil es ohne Datenbank keine
 * Talleres gibt. On Tour gibt es dagegen doppelt -- in der Datenbank UND als
 * vollständigen, gepflegten Satz in src/data/on-tour.ts. Diese Datei ist
 * deshalb bewusst als Übergang gebaut; der Bereich soll auch dann stehen,
 * wenn
 *
 *   * 008_on_tour.sql noch nicht eingespielt ist (die Views fehlen),
 *   * die Zugangsdaten fehlen (kein PUBLIC_SUPABASE_URL, etwa in einem
 *     frischen Checkout oder in einer Vorschau-Umgebung ohne Secrets),
 *   * die Datensätze in der Datenbank stehen, aber noch niemand sie
 *     veröffentlicht hat.
 *
 * In allen drei Fällen greift der Satz aus src/data/on-tour.ts. Der Build
 * bleibt nie stehen, und die Website zeigt in keinem Fall eine leere
 * Seminarliste oder -- schlimmer -- eine leere Zonentabelle neben einem
 * Preisrechner. Was passiert ist, steht als Warnung im Buildprotokoll;
 * stillschweigend auf Ersatzdaten auszuweichen wäre die Art Freundlichkeit,
 * die einen Monat später niemand mehr versteht.
 *
 * Seminare und Zonen fallen dabei UNABHÄNGIG voneinander zurück. Das ist
 * Absicht: sie liegen in zwei Tabellen, weil sie sich unabhängig ändern, und
 * ein halb veröffentlichter Stand soll nicht die jeweils andere Hälfte mit
 * auf die Ersatzdaten zurückwerfen.
 */

/* ===========================================================================
   Gemeinsames
   =========================================================================== */

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
      '[on-tour] Keine Verbindung zu Supabase konfiguriert — es gelten die ' +
        'Daten aus src/data/on-tour.ts.\n' +
        `Meldung: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Die Gegensprache -- als Notnagel, wenn eine Übersetzung fehlt. */
function otherLang(lang: Lang): Lang {
  return lang === 'es' ? 'en' : 'es';
}

/**
 * Währung aus der Datenbank in die enge Typform bringen.
 *
 * Die Datenbank prüft dasselbe bereits (`*_currency_check`); hier wird es ein
 * zweites Mal gefiltert, weil `published_payload` ein Schnappschuss ist: er
 * wurde geschrieben, als die damalige Prüfung galt, und niemand garantiert,
 * dass sie seither unverändert geblieben ist. Ein unbekanntes Kürzel liefe
 * sonst bis in `currencyPrefix[...]` durch und ergäbe dort "undefined 45".
 */
function toCurrency(value: unknown): WorkshopCurrency {
  return value === 'UYU' || value === 'EUR' || value === 'ARS' ? value : 'USD';
}

/* ===========================================================================
   Seminare
   =========================================================================== */

/** Textfelder je Sprache, so wie sie im Backend gespeichert werden. */
interface SeminarioTranslationRow {
  title: string;
  summary: string;
  longDesc: string;
  incluye: string[];
  necesitamos: string;
}

interface SeminarioPublicRow {
  /** Entspricht `Seminario.id` -- der Wert steht im Anfrageformular. */
  slug: string;
  numero: number;
  pigmento: string;
  precio: number;
  precio_tipo: string;
  currency: string;
  /** Minuten, nicht Stunden. */
  duracion: number;
  min_personas: number;
  max_personas: number;
  activo: boolean;
  translations: Partial<Record<Lang, SeminarioTranslationRow>>;
  sort_order: number;
}

/**
 * Fehlt eine Sprache, greift die andere als Notnagel -- dieselbe Regel wie bei
 * Talleres und Módulos: ein halb übersetztes Seminar soll den Build nicht
 * anhalten, eine leere Karte wäre schlimmer als eine spanische Karte auf der
 * englischen Seite. Fehlen BEIDE, kommt `null` zurück und der Aufrufer nimmt
 * den ganzen Satz aus src/data/on-tour.ts.
 */
function pickSeminarioText(
  row: SeminarioPublicRow,
  lang: Lang,
): SeminarioTranslationRow | null {
  return row.translations?.[lang] ?? row.translations?.[otherLang(lang)] ?? null;
}

function toSeminarioTexto(row: SeminarioTranslationRow): SeminarioTexto {
  return {
    title: row.title ?? '',
    summary: row.summary ?? '',
    longDesc: row.longDesc ?? '',
    incluye: Array.isArray(row.incluye) ? row.incluye.filter((x) => typeof x === 'string') : [],
    necesitamos: row.necesitamos ?? '',
  };
}

/** Pigment auf die drei Werte aus tokens.css eingrenzen -- siehe toCurrency(). */
function toPigmento(value: unknown): Seminario['pigmento'] {
  return value === 'barro' || value === 'lavanda' ? value : 'miel';
}

/**
 * Preisart.
 *
 * Hier steht bewusst KEIN nachgiebiges "im Zweifel pro Person": ein falsch
 * geratener Wert verwandelt eine Pauschale von 1600 Pesos in 1600 Pesos MAL
 * Teilnehmerzahl. Ein unbekannter Wert kann in einem Schnappschuss aber
 * vorkommen (siehe toCurrency()), also wird er gemeldet und der Datensatz
 * fällt weg -- lieber ein Seminar weniger auf der Seite als ein Preis, den
 * niemand halten kann.
 */
function toPrecioTipo(value: unknown, slug: string): PrecioTipo | null {
  if (value === 'porPersona' || value === 'total') return value;
  console.warn(
    `[on-tour] Das Seminar "${slug}" hat keine gültige Preisart ` +
      `(precio_tipo = ${JSON.stringify(value)}). Es wird übersprungen: ohne ` +
      'diese Angabe wäre der Betrag zweideutig — „US$ 40" heißt je nach ' +
      'Seminar pro Kopf oder für die ganze Gruppe.',
  );
  return null;
}

function toSeminario(row: SeminarioPublicRow): Seminario | null {
  const es = pickSeminarioText(row, 'es');
  const en = pickSeminarioText(row, 'en');
  if (!es || !en) {
    console.warn(
      `[on-tour] Das Seminar "${row.slug}" hat im veröffentlichten Stand keine ` +
        'Texte. Im Backend unter /admin → On Tour ausfüllen und neu veröffentlichen.',
    );
    return null;
  }

  const precioTipo = toPrecioTipo(row.precio_tipo, row.slug);
  if (!precioTipo) return null;

  const minPersonas = Number(row.min_personas) || 1;
  const maxPersonas = Number(row.max_personas) || minPersonas;

  return {
    id: row.slug,
    numero: Number(row.numero) || 0,
    pigmento: toPigmento(row.pigmento),
    precio: Number(row.precio) || 0,
    precioTipo,
    currency: toCurrency(row.currency),
    duracion: Number(row.duracion) || 0,
    minPersonas,
    // Die Datenbank prüft dasselbe (on_tour_seminarios_max_personas_check);
    // ein alter Schnappschuss könnte es trotzdem verletzen, und "ab 8 bis 6
    // Personen" ist auf einer Karte schlimmer als eine stille Korrektur.
    maxPersonas: Math.max(minPersonas, maxPersonas),
    activo: row.activo !== false,
    text: { es: toSeminarioTexto(es), en: toSeminarioTexto(en) },
  };
}

/**
 * Nur veröffentlichte Seminare, in der im Backend gesetzten Reihenfolge.
 * Kommt nichts Brauchbares zurück, gilt der Satz aus src/data/on-tour.ts.
 */
export async function fetchSeminarios(): Promise<Seminario[]> {
  const client = await loadClient();
  if (!client) return seminariosDeCodigo;

  const { data, error } = await client
    .from('on_tour_seminarios_public')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn(
      '[on-tour] Die Seminare konnten nicht aus Supabase geladen werden — es ' +
        'gelten die Daten aus src/data/on-tour.ts.\n' +
        `Meldung der Datenbank: ${error.message}\n` +
        'Häufigste Ursache: supabase/migrations/008_on_tour.sql ist noch nicht ' +
        'eingespielt. Dann fehlt die View "on_tour_seminarios_public".',
    );
    return seminariosDeCodigo;
  }

  const rows = ((data ?? []) as SeminarioPublicRow[])
    .map(toSeminario)
    .filter((s): s is Seminario => s !== null);

  if (rows.length === 0) {
    console.warn(
      '[on-tour] In "on_tour_seminarios_public" steht kein veröffentlichtes ' +
        'Seminar — es gelten die Daten aus src/data/on-tour.ts.\n' +
        'Im Backend unter /admin → On Tour die Seminare öffnen und auf ' +
        '"Publicar" tippen.',
    );
    return seminariosDeCodigo;
  }

  return rows;
}

/* ===========================================================================
   Anfahrtszonen
   =========================================================================== */

interface ZonaTranslationRow {
  nombre: string;
  /** Welche Orte dazugehören -- beantwortet "bin ich da drin?". */
  detalle: string;
}

interface ZonaPublicRow {
  /** Entspricht `Zona.id` -- der Wert steht im Anfrageformular. */
  slug: string;
  /**
   * null heißt "wird von Hand gerechnet" (a_pedido), NIE "kostet nichts".
   * Siehe die CHECK-Bedingung on_tour_zonas_a_pedido_check in Migration 008.
   */
  recargo: number | null;
  currency: string;
  a_pedido: boolean;
  orden: number;
  translations: Partial<Record<Lang, ZonaTranslationRow>>;
  sort_order: number;
}

function pickZonaText(row: ZonaPublicRow, lang: Lang): ZonaTranslationRow | null {
  return row.translations?.[lang] ?? row.translations?.[otherLang(lang)] ?? null;
}

function toZona(row: ZonaPublicRow): Zona | null {
  const es = pickZonaText(row, 'es');
  const en = pickZonaText(row, 'en');
  if (!es || !en) {
    console.warn(
      `[on-tour] Die Zone "${row.slug}" hat im veröffentlichten Stand keine ` +
        'Texte. Im Backend unter /admin → On Tour ausfüllen und neu veröffentlichen.',
    );
    return null;
  }

  const aPedido = row.a_pedido === true || row.recargo === null || row.recargo === undefined;

  return {
    id: row.slug,
    // `Zona.recargo` ist eine Zahl, kein `number | null` -- die Unterscheidung
    // trägt allein `aPedido`. Die 0 ist hier deshalb kein Preis, sondern ein
    // Platzhalter, den die Website nur dann anzeigt, wenn aPedido false ist.
    // Genau darum wird aPedido oben aus BEIDEN Angaben gebildet: sähe es nur
    // auf a_pedido, würde ein Schnappschuss mit recargo=null und
    // a_pedido=false als "Incluido" auf der Seite stehen — ein Versprechen,
    // das niemand halten kann.
    recargo: aPedido ? 0 : Number(row.recargo) || 0,
    currency: toCurrency(row.currency),
    aPedido,
    orden: Number(row.orden) || 0,
    nombre: { es: es.nombre ?? '', en: en.nombre ?? '' },
    detalle: { es: es.detalle ?? '', en: en.detalle ?? '' },
  };
}

/**
 * Nur veröffentlichte Zonen, sortiert nach `orden` -- als Ringe von der Chacra
 * nach außen, nicht nach Preis. So sucht auch jemand, der wissen will, ob sein
 * Ort dabei ist (siehe Kommentar bei `zonas` in src/data/on-tour.ts).
 *
 * Kommt nichts Brauchbares zurück, gilt der Satz aus src/data/on-tour.ts.
 */
export async function fetchZonas(): Promise<Zona[]> {
  const client = await loadClient();
  if (!client) return zonasDeCodigo;

  const { data, error } = await client
    .from('on_tour_zonas_public')
    .select('*')
    .order('orden', { ascending: true });

  if (error) {
    console.warn(
      '[on-tour] Die Anfahrtszonen konnten nicht aus Supabase geladen werden — ' +
        'es gelten die Daten aus src/data/on-tour.ts.\n' +
        `Meldung der Datenbank: ${error.message}\n` +
        'Häufigste Ursache: supabase/migrations/008_on_tour.sql ist noch nicht ' +
        'eingespielt. Dann fehlt die View "on_tour_zonas_public".',
    );
    return zonasDeCodigo;
  }

  const rows = ((data ?? []) as ZonaPublicRow[])
    .map(toZona)
    .filter((z): z is Zona => z !== null);

  if (rows.length === 0) {
    console.warn(
      '[on-tour] In "on_tour_zonas_public" steht keine veröffentlichte Zone — ' +
        'es gelten die Daten aus src/data/on-tour.ts.\n' +
        'Im Backend unter /admin → On Tour die Zonen öffnen und auf ' +
        '"Publicar" tippen.',
    );
    return zonasDeCodigo;
  }

  return rows.sort((a, b) => a.orden - b.orden);
}
