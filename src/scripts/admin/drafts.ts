/**
 * Die Formular-Datenstruktur des Backends.
 *
 * Zwischen Datenbankzeile und Formular liegt bewusst eine eigene Form:
 *
 * - In der Datenbank stehen die Texte nach Sprache getrennt
 *   (`translations.es.title`, `translations.en.title`).
 * - Im Formular gehört ein Feld **zusammen** (`title: { es, en }`), weil
 *   die ES/EN-Reiter ersatzlos entfallen sind (Spec 2.3, Problem P2).
 *
 * Nur so kann eine Programmzeile Spanisch und Englisch gemeinsam tragen --
 * im alten Backend waren `programme.es` und `programme.en` zwei getrennte
 * Listen, die unterschiedlich lang werden konnten.
 *
 * Dieselben Strukturen liest die Live-Vorschau (`preview.ts`).
 */
import type { CasaGlyph } from '../../data/casa-glyphs';
import type { CasaStatus } from '../../data/casas';
import type { Mes, ModuloEstado, ModuloLugar } from '../../data/modulos';
import type { WorkshopCurrency } from '../../data/workshops';
import type { ThemeId } from '../../data/workshop-themes';
import type { Entity } from './store';

export interface Bilingual {
  es: string;
  en: string;
}

export const emptyBilingual = (): Bilingual => ({ es: '', en: '' });

/* ===========================================================================
   Talleres
   =========================================================================== */

export interface ProgrammeStepDraft {
  title: Bilingual;
  text: Bilingual;
}

export interface WorkshopShowDraft {
  programme: boolean;
  included: boolean;
  bring: boolean;
  forWhom: boolean;
  languages: boolean;
  meetingPoint: boolean;
}

export interface WorkshopDraft {
  slug: string;
  themeId: ThemeId;
  price: number;
  currency: WorkshopCurrency;
  hours: number;
  maxPeople: number;
  instructorFirstName: string;
  instructorLastName: string;
  /** ISO-Datumsstrings, aufsteigend sortiert. */
  dates: string[];
  show: WorkshopShowDraft;
  title: Bilingual;
  /** Kurztext der Karte; in der Datenbank `summary`, auf der Website `desc`. */
  summary: Bilingual;
  longDesc: Bilingual;
  audience: Bilingual;
  forWhom: Bilingual;
  languages: Bilingual;
  meetingPoint: Bilingual;
  programme: ProgrammeStepDraft[];
  included: Bilingual[];
  bring: Bilingual[];
}

/** Textspalten einer Sprache, so wie sie im jsonb liegen. */
export interface WorkshopTranslation {
  title: string;
  summary: string;
  longDesc: string;
  audience: string;
  forWhom: string;
  languages: string;
  meetingPoint: string;
  programme: { title: string; text: string }[];
  included: string[];
  bring: string[];
}

export interface WorkshopRow extends Entity {
  slug: string;
  theme_id: ThemeId;
  price: number;
  currency: WorkshopCurrency;
  hours: number;
  max_people: number;
  instructor_first_name: string;
  instructor_last_name: string;
  dates: string[];
  show_programme: boolean;
  show_included: boolean;
  show_bring: boolean;
  show_for_whom: boolean;
  show_languages: boolean;
  show_meeting_point: boolean;
  translations: Partial<Record<'es' | 'en', Partial<WorkshopTranslation>>>;
}

export function emptyWorkshopDraft(): WorkshopDraft {
  return {
    slug: '',
    themeId: 'clay',
    price: 0,
    currency: 'USD',
    hours: 3,
    maxPeople: 8,
    instructorFirstName: '',
    instructorLastName: '',
    dates: [],
    show: {
      programme: true,
      included: true,
      bring: true,
      forWhom: true,
      languages: true,
      meetingPoint: true,
    },
    title: emptyBilingual(),
    summary: emptyBilingual(),
    longDesc: emptyBilingual(),
    audience: emptyBilingual(),
    forWhom: emptyBilingual(),
    languages: emptyBilingual(),
    meetingPoint: emptyBilingual(),
    programme: [],
    included: [],
    bring: [],
  };
}

/** Holt ein Textfeld aus beiden Sprachen und legt es zusammen. */
function pair(
  // Absichtlich die kleinste Form, die alle drei Inhaltsarten erfüllen:
  // "je Sprache irgendein Objekt". Eine Aufzählung der konkreten Zeilentypen
  // müsste bei jeder neuen Inhaltsart mitwachsen, ohne dass die Funktion
  // selbst je etwas anderes täte.
  row: unknown,
  key: string,
): Bilingual {
  const langs = (row ?? {}) as Partial<Record<'es' | 'en', unknown>>;
  const get = (lang: 'es' | 'en'): string => {
    const t = langs[lang] as Record<string, unknown> | undefined;
    const value = t?.[key];
    return typeof value === 'string' ? value : '';
  };
  return { es: get('es'), en: get('en') };
}

/** Zwei gleich lange Stringlisten zu einer Liste gepaarter Werte. */
function pairList(es: string[] | undefined, en: string[] | undefined): Bilingual[] {
  const length = Math.max(es?.length ?? 0, en?.length ?? 0);
  return Array.from({ length }, (_, i) => ({ es: es?.[i] ?? '', en: en?.[i] ?? '' }));
}

export function draftFromWorkshop(row: WorkshopRow): WorkshopDraft {
  const es = row.translations?.es ?? {};
  const en = row.translations?.en ?? {};
  const steps = Math.max(es.programme?.length ?? 0, en.programme?.length ?? 0);

  return {
    slug: row.slug ?? '',
    themeId: row.theme_id ?? 'clay',
    price: Number(row.price) || 0,
    currency: row.currency ?? 'USD',
    hours: Number(row.hours) || 0,
    maxPeople: Number(row.max_people) || 0,
    instructorFirstName: row.instructor_first_name ?? '',
    instructorLastName: row.instructor_last_name ?? '',
    dates: Array.isArray(row.dates) ? row.dates : [],
    show: {
      programme: row.show_programme !== false,
      included: row.show_included !== false,
      bring: row.show_bring !== false,
      forWhom: row.show_for_whom !== false,
      languages: row.show_languages !== false,
      meetingPoint: row.show_meeting_point !== false,
    },
    title: pair(row.translations, 'title'),
    summary: pair(row.translations, 'summary'),
    longDesc: pair(row.translations, 'longDesc'),
    audience: pair(row.translations, 'audience'),
    forWhom: pair(row.translations, 'forWhom'),
    languages: pair(row.translations, 'languages'),
    meetingPoint: pair(row.translations, 'meetingPoint'),
    programme: Array.from({ length: steps }, (_, i) => ({
      title: { es: es.programme?.[i]?.title ?? '', en: en.programme?.[i]?.title ?? '' },
      text: { es: es.programme?.[i]?.text ?? '', en: en.programme?.[i]?.text ?? '' },
    })),
    included: pairList(es.included, en.included),
    bring: pairList(es.bring, en.bring),
  };
}

function workshopTranslation(d: WorkshopDraft, lang: 'es' | 'en'): WorkshopTranslation {
  return {
    title: d.title[lang],
    summary: d.summary[lang],
    longDesc: d.longDesc[lang],
    audience: d.audience[lang],
    forWhom: d.forWhom[lang],
    languages: d.languages[lang],
    meetingPoint: d.meetingPoint[lang],
    programme: d.programme.map((s) => ({ title: s.title[lang], text: s.text[lang] })),
    included: d.included.map((x) => x[lang]),
    bring: d.bring.map((x) => x[lang]),
  };
}

export function workshopPatch(d: WorkshopDraft): Partial<WorkshopRow> {
  return {
    slug: d.slug,
    theme_id: d.themeId,
    price: d.price,
    currency: d.currency,
    hours: d.hours,
    max_people: d.maxPeople,
    instructor_first_name: d.instructorFirstName,
    instructor_last_name: d.instructorLastName,
    dates: d.dates,
    show_programme: d.show.programme,
    show_included: d.show.included,
    show_bring: d.show.bring,
    show_for_whom: d.show.forWhom,
    show_languages: d.show.languages,
    show_meeting_point: d.show.meetingPoint,
    translations: {
      es: workshopTranslation(d, 'es'),
      en: workshopTranslation(d, 'en'),
    },
  };
}

/* ===========================================================================
   Módulos ("Las abejas educan")
   =========================================================================== */

/**
 * Dieselbe Trennung wie bei den Talleres: sprachneutrale Technik als eigene
 * Felder, Texte gepaart (`title: { es, en }`), damit Spanisch und Englisch im
 * Formular nebeneinander stehen statt in zwei Reitern.
 *
 * Zwei Dinge sind hier anders als bei den Talleres, und beide kommen aus der
 * Sache selbst (siehe supabase/migrations/006_modulos.sql):
 *
 *  - `meses` gehört zum EINZELNEN Modul, nicht zum Bereich. Schuljahr und
 *    Bienensaison decken sich nicht: die drei Module in der Schule laufen von
 *    März bis November, der Besuch auf der Chacra von Oktober bis April.
 *  - `estado` ist nicht der Veröffentlichungszustand. Ein Modul auf
 *    'proximamente' steht auf der Website, nur eben ohne Auswahlknopf; ein
 *    Entwurf steht gar nicht dort. Deshalb zwei Angaben nebeneinander.
 */
export interface ModuloDraft {
  /** Entspricht `Modulo.id` in src/data/modulos.ts; steht im Anfrageformular. */
  slug: string;
  /** Sichtbare Nummer in der Wabe, NICHT die Sortierung. */
  numero: number;
  lugar: ModuloLugar;
  estado: ModuloEstado;
  edadMin: number;
  /** 0 heißt im Formular "offen nach oben"; in der Datenbank wird daraus null. */
  edadMax: number;
  /** Dauer in Minuten -- als Zahl, damit sich Summen rechnen lassen. */
  duracion: number;
  maxAlumnos: number;
  meses: Mes[];
  title: Bilingual;
  /** Wie die Altersangabe geschrieben steht, z. B. "3.° a 6.°". */
  clase: Bilingual;
  /** Ein bis zwei Sätze auf der Karte. */
  summary: Bilingual;
  /** Der lange Text hinter "Leer más". */
  longDesc: Bilingual;
  /** Ein bis drei Lernziele. */
  objetivos: Bilingual[];
}

/** Textspalten einer Sprache, so wie sie im jsonb liegen. */
export interface ModuloTranslation {
  title: string;
  clase: string;
  summary: string;
  longDesc: string;
  objetivos: string[];
}

export interface ModuloRow extends Entity {
  slug: string;
  numero: number;
  lugar: ModuloLugar;
  estado: ModuloEstado;
  edad_min: number;
  /** null = offen nach oben ("ab 8"). */
  edad_max: number | null;
  duracion: number;
  max_alumnos: number;
  meses: number[];
  translations: Partial<Record<'es' | 'en', Partial<ModuloTranslation>>>;
}

export function emptyModuloDraft(): ModuloDraft {
  return {
    slug: '',
    numero: 1,
    lugar: 'aula',
    estado: 'disponible',
    edadMin: 6,
    edadMax: 0,
    duracion: 60,
    maxAlumnos: 30,
    // Vorbelegung mit dem Schuljahr (März bis November): drei der vier
    // bestehenden Module laufen genau so, und ein neues Modul entsteht viel
    // wahrscheinlicher für die Schule als für die Chacra.
    meses: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    title: emptyBilingual(),
    clase: emptyBilingual(),
    summary: emptyBilingual(),
    longDesc: emptyBilingual(),
    objetivos: [],
  };
}

/** Nur ganze Zahlen 1-12 -- alles andere ist kein Monat. */
function toMeses(value: unknown): Mes[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is Mes => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12)
    .sort((a, b) => a - b);
}

export function draftFromModulo(row: ModuloRow): ModuloDraft {
  const es = row.translations?.es ?? {};
  const en = row.translations?.en ?? {};

  return {
    slug: row.slug ?? '',
    numero: Number(row.numero) || 1,
    lugar: row.lugar ?? 'aula',
    estado: row.estado ?? 'disponible',
    edadMin: Number(row.edad_min) || 0,
    // null (offen nach oben) wird im Formular zur 0 -- das Zahlenfeld hat
    // keinen leeren Zustand, den es zuverlässig zurückgeben könnte.
    edadMax: row.edad_max === null || row.edad_max === undefined ? 0 : Number(row.edad_max),
    duracion: Number(row.duracion) || 0,
    maxAlumnos: Number(row.max_alumnos) || 0,
    meses: toMeses(row.meses),
    title: pair(row.translations, 'title'),
    clase: pair(row.translations, 'clase'),
    summary: pair(row.translations, 'summary'),
    longDesc: pair(row.translations, 'longDesc'),
    objetivos: pairList(es.objetivos, en.objetivos),
  };
}

function moduloTranslation(d: ModuloDraft, lang: 'es' | 'en'): ModuloTranslation {
  return {
    title: d.title[lang],
    clase: d.clase[lang],
    summary: d.summary[lang],
    longDesc: d.longDesc[lang],
    objetivos: d.objetivos.map((x) => x[lang]),
  };
}

export function moduloPatch(d: ModuloDraft): Partial<ModuloRow> {
  return {
    slug: d.slug,
    numero: d.numero,
    lugar: d.lugar,
    estado: d.estado,
    edad_min: d.edadMin,
    // Hier die Rückübersetzung von oben: 0 oder ein Wert unterhalb von
    // edadMin ergibt keine sinnvolle Obergrenze und heißt "offen nach oben".
    // Die Datenbank prüft dasselbe (modulos_edad_max_check) -- aber sie würde
    // beim Autospeichern eine Fehlermeldung werfen, statt die Absicht zu
    // verstehen.
    edad_max: d.edadMax > 0 && d.edadMax >= d.edadMin ? d.edadMax : null,
    duracion: d.duracion,
    max_alumnos: d.maxAlumnos,
    meses: [...d.meses].sort((a, b) => a - b),
    translations: {
      es: moduloTranslation(d, 'es'),
      en: moduloTranslation(d, 'en'),
    },
  };
}

/* ===========================================================================
   Casas
   =========================================================================== */

export interface CasaAmenityDraft {
  glyph: CasaGlyph;
  label: Bilingual;
}

export interface CasaHighlightDraft extends CasaAmenityDraft {
  note: Bilingual;
}

/** Ein bereits hochgeladenes Foto -- Fotos sind Sofortaktionen. */
export interface CasaImageDraft {
  id: string;
  url: string;
  storagePath: string;
  alt: Bilingual;
  sortOrder: number;
}

export interface CasaDraft {
  slug: string;
  /** Baufortschritt (`build_status`), NICHT der Veröffentlichungszustand. */
  buildStatus: CasaStatus;
  airbnbUrl: string;
  beds: number;
  guests: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  amenities: CasaAmenityDraft[];
  highlights: CasaHighlightDraft[];
  title: Bilingual;
  tagline: Bilingual;
  /** Ein Eintrag pro Absatz. */
  body: Bilingual[];
  bookNote: Bilingual;
  /** Nur zum Anzeigen in der Vorschau; gespeichert wird in `casa_images`. */
  images: CasaImageDraft[];
}

export interface CasaTranslation {
  title: string;
  tagline: string;
  body: string[];
  bookNote: string;
}

export interface CasaRow extends Entity {
  slug: string;
  build_status: CasaStatus;
  airbnb_url: string | null;
  beds: number;
  guests: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  amenities: { glyph: CasaGlyph; label: Bilingual }[];
  highlights: { glyph: CasaGlyph; label: Bilingual; note: Bilingual }[];
  translations: Partial<Record<'es' | 'en', Partial<CasaTranslation>>>;
}

export function emptyCasaDraft(): CasaDraft {
  return {
    slug: '',
    buildStatus: 'planeado',
    airbnbUrl: '',
    beds: 0,
    guests: 0,
    area: 0,
    bedrooms: 0,
    bathrooms: 0,
    amenities: [],
    highlights: [],
    title: emptyBilingual(),
    tagline: emptyBilingual(),
    body: [],
    bookNote: emptyBilingual(),
    images: [],
  };
}

export function draftFromCasa(row: CasaRow): CasaDraft {
  const es = row.translations?.es ?? {};
  const en = row.translations?.en ?? {};

  return {
    slug: row.slug ?? '',
    buildStatus: row.build_status ?? 'planeado',
    airbnbUrl: row.airbnb_url ?? '',
    beds: Number(row.beds) || 0,
    guests: Number(row.guests) || 0,
    area: Number(row.area) || 0,
    bedrooms: Number(row.bedrooms) || 0,
    bathrooms: Number(row.bathrooms) || 0,
    amenities: (row.amenities ?? []).map((a) => ({
      glyph: a.glyph,
      label: { es: a.label?.es ?? '', en: a.label?.en ?? '' },
    })),
    highlights: (row.highlights ?? []).map((h) => ({
      glyph: h.glyph,
      label: { es: h.label?.es ?? '', en: h.label?.en ?? '' },
      note: { es: h.note?.es ?? '', en: h.note?.en ?? '' },
    })),
    title: pair(row.translations, 'title'),
    tagline: pair(row.translations, 'tagline'),
    body: pairList(es.body, en.body),
    bookNote: pair(row.translations, 'bookNote'),
    images: [],
  };
}

function casaTranslation(d: CasaDraft, lang: 'es' | 'en'): CasaTranslation {
  return {
    title: d.title[lang],
    tagline: d.tagline[lang],
    body: d.body.map((p) => p[lang]),
    bookNote: d.bookNote[lang],
  };
}

export function casaPatch(d: CasaDraft): Partial<CasaRow> {
  return {
    slug: d.slug,
    build_status: d.buildStatus,
    airbnb_url: d.airbnbUrl || null,
    beds: d.beds,
    guests: d.guests,
    area: d.area,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    amenities: d.amenities,
    highlights: d.highlights,
    translations: {
      es: casaTranslation(d, 'es'),
      en: casaTranslation(d, 'en'),
    },
  };
}

/* ===========================================================================
   On Tour — Seminare und Anfahrtszonen
   =========================================================================== */

/**
 * Dieselbe Trennung wie überall sonst: sprachneutrale Technik als eigene
 * Felder, Texte gepaart (`title: { es, en }`), damit Spanisch und Englisch im
 * Formular nebeneinander stehen statt in zwei Reitern.
 *
 * Zwei Dinge sind hier anders als bei Talleres und Módulos, und beide kommen
 * aus der Sache selbst (siehe supabase/migrations/008_on_tour.sql):
 *
 *  - `precioTipo` sagt, WIE der Betrag zu lesen ist: je Person oder als
 *    Pauschale für die ganze Gruppe. Der Betrag allein ist zweideutig --
 *    "US$ 40" heißt beim einen Seminar pro Kopf und beim nächsten für alle
 *    zusammen. Das Feld steht deshalb im Formular als zwei große Karten
 *    direkt neben dem Betrag und nicht als Zeile in den Einstellungen.
 *  - `activo` ist nicht der Veröffentlichungszustand. Ein Seminar mit
 *    activo=false steht auf der Website, ist aber nicht auswählbar; ein
 *    Entwurf steht gar nicht dort.
 */
export interface SeminarioDraft {
  /** Entspricht `Seminario.id` in src/data/on-tour.ts; steht im Anfrageformular. */
  slug: string;
  /** Sichtbare Nummer der Karte, NICHT die Sortierung. */
  numero: number;
  pigmento: 'miel' | 'barro' | 'lavanda';
  precio: number;
  precioTipo: 'porPersona' | 'total';
  currency: WorkshopCurrency;
  /** Dauer in Minuten -- als Zahl, damit sich Summen rechnen lassen. */
  duracion: number;
  minPersonas: number;
  maxPersonas: number;
  activo: boolean;
  title: Bilingual;
  /** Ein bis zwei Sätze auf der Karte. */
  summary: Bilingual;
  /** Der lange Text hinter "Leer más". */
  longDesc: Bilingual;
  /** Was wir mitbringen -- das entscheidet oft die Buchung. */
  incluye: Bilingual[];
  /** Was der Ort stellen muss. Vermeidet die häufigste Rückfrage. */
  necesitamos: Bilingual;
}

/** Textspalten einer Sprache, so wie sie im jsonb liegen. */
export interface SeminarioTranslation {
  title: string;
  summary: string;
  longDesc: string;
  incluye: string[];
  necesitamos: string;
}

export interface SeminarioRow extends Entity {
  slug: string;
  numero: number;
  pigmento: 'miel' | 'barro' | 'lavanda';
  precio: number;
  precio_tipo: 'porPersona' | 'total';
  currency: WorkshopCurrency;
  duracion: number;
  min_personas: number;
  max_personas: number;
  activo: boolean;
  translations: Partial<Record<'es' | 'en', Partial<SeminarioTranslation>>>;
}

export function emptySeminarioDraft(): SeminarioDraft {
  return {
    slug: '',
    numero: 1,
    pigmento: 'miel',
    precio: 0,
    // Vorbelegt, weil zwei der drei bestehenden Seminare so abgerechnet
    // werden -- aber im Formular trotzdem sichtbar ausgewählt und nicht
    // versteckt. Ein leerer Zustand wäre hier keine Hilfe: er ließe die
    // Nutzerin nur raten, was passiert, wenn sie nichts anfasst.
    precioTipo: 'porPersona',
    currency: 'USD',
    duracion: 120,
    minPersonas: 6,
    maxPersonas: 20,
    activo: true,
    title: emptyBilingual(),
    summary: emptyBilingual(),
    longDesc: emptyBilingual(),
    incluye: [],
    necesitamos: emptyBilingual(),
  };
}

export function draftFromSeminario(row: SeminarioRow): SeminarioDraft {
  const es = row.translations?.es ?? {};
  const en = row.translations?.en ?? {};
  const minPersonas = Number(row.min_personas) || 1;

  return {
    slug: row.slug ?? '',
    numero: Number(row.numero) || 1,
    pigmento: row.pigmento ?? 'miel',
    precio: Number(row.precio) || 0,
    precioTipo: row.precio_tipo === 'total' ? 'total' : 'porPersona',
    currency: row.currency ?? 'USD',
    duracion: Number(row.duracion) || 0,
    minPersonas,
    maxPersonas: Number(row.max_personas) || minPersonas,
    activo: row.activo !== false,
    title: pair(row.translations, 'title'),
    summary: pair(row.translations, 'summary'),
    longDesc: pair(row.translations, 'longDesc'),
    incluye: pairList(es.incluye, en.incluye),
    necesitamos: pair(row.translations, 'necesitamos'),
  };
}

function seminarioTranslation(d: SeminarioDraft, lang: 'es' | 'en'): SeminarioTranslation {
  return {
    title: d.title[lang],
    summary: d.summary[lang],
    longDesc: d.longDesc[lang],
    incluye: d.incluye.map((x) => x[lang]),
    necesitamos: d.necesitamos[lang],
  };
}

export function seminarioPatch(d: SeminarioDraft): Partial<SeminarioRow> {
  return {
    slug: d.slug,
    numero: d.numero,
    pigmento: d.pigmento,
    precio: d.precio,
    precio_tipo: d.precioTipo,
    currency: d.currency,
    duracion: d.duracion,
    min_personas: d.minPersonas,
    // Die Datenbank prüft dasselbe (on_tour_seminarios_max_personas_check) --
    // aber sie würde beim Autospeichern eine Fehlermeldung werfen, während
    // die Nutzerin gerade die Untergrenze nach oben tippt und die Obergrenze
    // noch die alte ist. Hier wird die Absicht verstanden statt abgelehnt.
    max_personas: Math.max(d.minPersonas, d.maxPersonas),
    activo: d.activo,
    translations: {
      es: seminarioTranslation(d, 'es'),
      en: seminarioTranslation(d, 'en'),
    },
  };
}

/**
 * Anfahrtszone.
 *
 * `aPedido` ist kein Preis von null, sondern das Gegenteil: der Aufschlag
 * steht noch nicht fest und wird von Hand genannt. Im Formular ist `recargo`
 * eine gewöhnliche Zahl (ein Zahlenfeld hat keinen leeren Zustand, auf den
 * man sich verlassen könnte); erst `zonaPatch()` übersetzt das zurück in das
 * `null`, das die Datenbank für "a pedido" verlangt.
 */
export interface ZonaDraft {
  /** Entspricht `Zona.id` in src/data/on-tour.ts; steht im Anfrageformular. */
  slug: string;
  /** Nur gültig, solange aPedido false ist. 0 heißt dann "Sin recargo". */
  recargo: number;
  currency: WorkshopCurrency;
  aPedido: boolean;
  /** Leserichtung der Liste: Ringe von der Chacra nach außen. */
  orden: number;
  nombre: Bilingual;
  /** Welche Orte dazugehören -- beantwortet "bin ich da drin?". */
  detalle: Bilingual;
}

export interface ZonaTranslation {
  nombre: string;
  detalle: string;
}

export interface ZonaRow extends Entity {
  slug: string;
  /** null = "a pedido"; siehe on_tour_zonas_a_pedido_check in Migration 008. */
  recargo: number | null;
  currency: WorkshopCurrency;
  a_pedido: boolean;
  orden: number;
  translations: Partial<Record<'es' | 'en', Partial<ZonaTranslation>>>;
}

export function emptyZonaDraft(): ZonaDraft {
  return {
    slug: '',
    recargo: 0,
    // Die Anfahrt wird in Pesos gerechnet, nicht in Dollar: sie ist eine
    // Fahrt innerhalb Uruguays, kein Seminarpreis für Gäste von außerhalb.
    currency: 'UYU',
    aPedido: false,
    orden: 1,
    nombre: emptyBilingual(),
    detalle: emptyBilingual(),
  };
}

export function draftFromZona(row: ZonaRow): ZonaDraft {
  return {
    slug: row.slug ?? '',
    // null (a pedido) wird im Formular zur 0 -- das Zahlenfeld bleibt dabei
    // ausgeblendet, damit die 0 niemandem als Preis begegnet.
    recargo: row.recargo === null || row.recargo === undefined ? 0 : Number(row.recargo),
    currency: row.currency ?? 'UYU',
    aPedido: row.a_pedido === true,
    orden: Number(row.orden) || 1,
    nombre: pair(row.translations, 'nombre'),
    detalle: pair(row.translations, 'detalle'),
  };
}

function zonaTranslation(d: ZonaDraft, lang: 'es' | 'en'): ZonaTranslation {
  return { nombre: d.nombre[lang], detalle: d.detalle[lang] };
}

export function zonaPatch(d: ZonaDraft): Partial<ZonaRow> {
  return {
    slug: d.slug,
    // Hier die Rückübersetzung: "a pedido" MUSS als null in der Datenbank
    // stehen, sonst verletzt die Zeile on_tour_zonas_a_pedido_check. Eine 0
    // an dieser Stelle wäre kein harmloser Rundungsfehler, sondern das
    // Versprechen "Incluido" auf der Website.
    recargo: d.aPedido ? null : d.recargo,
    currency: d.currency,
    a_pedido: d.aPedido,
    orden: d.orden,
    // sort_order läuft bei den Zonen mit `orden` mit: die Reihenfolge ist
    // hier Inhalt (Ringe von innen nach außen) und nicht eine Anzeigelaune,
    // deshalb gibt es keine zweite, davon abweichende Sortierung im Panel.
    sort_order: d.orden,
    translations: {
      es: zonaTranslation(d, 'es'),
      en: zonaTranslation(d, 'en'),
    },
  };
}
