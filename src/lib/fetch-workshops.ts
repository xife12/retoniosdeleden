import { supabase } from './supabase';
import { workshopThemes, type ThemeId } from '../data/workshop-themes';
import type {
  ProgrammeStep,
  Workshop,
  WorkshopCurrency,
  WorkshopText,
} from '../data/workshops';

/**
 * Liest die veröffentlichten Workshops zur Bauzeit aus Supabase.
 *
 * Quelle ist ausschließlich die View `workshops_public` -- sie liefert den
 * veröffentlichten Schnappschuss (`published_payload`), nie den Arbeitsstand
 * aus dem Backend. Dadurch landen Zwischenstände des Autospeicherns niemals
 * auf der Website. Siehe supabase/schema.sql.
 */

/** Textfelder je Sprache, so wie sie im Backend gespeichert werden. */
interface WorkshopTranslationRow {
  title: string;
  /** Kurztext der Karte -- heißt auf der Website `desc`. */
  summary: string;
  longDesc: string;
  audience: string;
  forWhom: string;
  languages: string;
  meetingPoint: string;
  programme: ProgrammeStep[];
  included: string[];
  bring: string[];
}

interface WorkshopPublicRow {
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
  translations: Partial<Record<'es' | 'en', WorkshopTranslationRow>>;
  sort_order: number;
}

/**
 * Fehlt eine Sprache, greift die andere als Notnagel. Ein halb übersetzter
 * Workshop soll den Build nicht anhalten -- eine leere Karte wäre schlimmer
 * als eine spanische Karte auf der englischen Seite.
 */
function pickTranslation(row: WorkshopPublicRow, lang: 'es' | 'en'): WorkshopTranslationRow {
  const own = row.translations?.[lang];
  if (own) return own;

  const fallback = row.translations?.[lang === 'es' ? 'en' : 'es'];
  if (fallback) return fallback;

  throw new Error(
    `Der Workshop "${row.slug}" hat im veröffentlichten Stand keine Texte.\n` +
      'Im Backend unter /admin ausfüllen und neu veröffentlichen.',
  );
}

function toWorkshopText(row: WorkshopTranslationRow): WorkshopText {
  return {
    title: row.title,
    desc: row.summary,
    audience: row.audience,
    longDesc: row.longDesc,
    programme: row.programme ?? [],
    included: row.included ?? [],
    bring: row.bring ?? [],
    forWhom: row.forWhom,
    languages: row.languages,
    meetingPoint: row.meetingPoint,
  };
}

function toWorkshop(row: WorkshopPublicRow): Workshop {
  const theme = workshopThemes[row.theme_id];
  if (!theme) {
    throw new Error(
      `Der Workshop "${row.slug}" verweist auf das unbekannte Thema "${row.theme_id}".\n` +
        `Bekannt sind: ${Object.keys(workshopThemes).join(', ')}.\n` +
        'Entweder im Backend ein anderes Thema wählen oder das Thema in ' +
        'src/data/workshop-themes.ts ergänzen.',
    );
  }

  return {
    id: row.slug,
    themeId: row.theme_id,
    accent: theme.accent,
    price: Number(row.price),
    currency: row.currency,
    hours: Number(row.hours),
    maxPeople: row.max_people,
    instructorFirstName: row.instructor_first_name ?? '',
    instructorLastName: row.instructor_last_name ?? '',
    dates: row.dates ?? [],
    show: {
      programme: row.show_programme,
      included: row.show_included,
      bring: row.show_bring,
      forWhom: row.show_for_whom,
      languages: row.show_languages,
      meetingPoint: row.show_meeting_point,
    },
    text: {
      es: toWorkshopText(pickTranslation(row, 'es')),
      en: toWorkshopText(pickTranslation(row, 'en')),
    },
  };
}

/** Nur veröffentlichte Workshops, in der im Backend gesetzten Reihenfolge. */
export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from('workshops_public')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(
      'Die Workshops konnten nicht aus Supabase geladen werden.\n' +
        `Meldung der Datenbank: ${error.message}\n` +
        'Häufigste Ursache: Das Schema ist noch nicht eingespielt. Dann fehlt die ' +
        'View "workshops_public" -- siehe SETUP-BACKEND.md, Abschnitt A oder B.',
    );
  }

  return (data as WorkshopPublicRow[]).map(toWorkshop);
}
