import { supabase } from './supabase';
import { workshopThemes, type ThemeId } from '../data/workshop-themes';
import type { ProgrammeStep, Workshop, WorkshopCurrency, WorkshopText } from '../data/workshops';

interface WorkshopTranslationRow {
  title: string;
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

interface WorkshopRow {
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
  translations: { es: WorkshopTranslationRow; en: WorkshopTranslationRow };
}

function toWorkshopText(row: WorkshopTranslationRow): WorkshopText {
  return {
    title: row.title,
    desc: row.summary,
    audience: row.audience,
    longDesc: row.longDesc,
    programme: row.programme,
    included: row.included,
    bring: row.bring,
    forWhom: row.forWhom,
    languages: row.languages,
    meetingPoint: row.meetingPoint,
  };
}

function toWorkshop(row: WorkshopRow): Workshop {
  return {
    id: row.slug,
    themeId: row.theme_id,
    accent: workshopThemes[row.theme_id].accent,
    price: Number(row.price),
    currency: row.currency,
    hours: Number(row.hours),
    maxPeople: row.max_people,
    instructorFirstName: row.instructor_first_name,
    instructorLastName: row.instructor_last_name,
    dates: row.dates,
    show: {
      programme: row.show_programme,
      included: row.show_included,
      bring: row.show_bring,
      forWhom: row.show_for_whom,
      languages: row.show_languages,
      meetingPoint: row.show_meeting_point,
    },
    text: {
      es: toWorkshopText(row.translations.es),
      en: toWorkshopText(row.translations.en),
    },
  };
}

/** Nur veröffentlichte Workshops, für den öffentlichen Seiten-Build. */
export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from('workshops')
    .select('*')
    .eq('status', 'published')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Workshops konnten nicht geladen werden: ${error.message}`);
  }

  return (data as WorkshopRow[]).map(toWorkshop);
}
