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
  row: WorkshopRow['translations'] | CasaRow['translations'],
  key: string,
): Bilingual {
  const get = (lang: 'es' | 'en'): string => {
    const t = row?.[lang] as Record<string, unknown> | undefined;
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
