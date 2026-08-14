import { supabase } from './supabase';
import type { CasaGlyph } from '../data/casa-glyphs';
import type {
  Casa,
  CasaHighlight,
  CasaImage,
  CasaListItem,
  CasaStatus,
  CasaText,
} from '../data/casas';

/**
 * Liest die veröffentlichten Lehmhäuser zur Bauzeit aus Supabase.
 *
 * Quelle ist ausschließlich die View `casas_public` -- der veröffentlichte
 * Schnappschuss, nie der Arbeitsstand aus dem Backend. Die Fotos stecken mit
 * im Schnappschuss (Feld `images`), damit ein Bild erst mit dem nächsten
 * „Publicar" auf der Website erscheint. Siehe supabase/schema.sql.
 *
 * Achtung Begriffe: In der Datenbank trägt `status` den
 * Veröffentlichungszustand, der Baufortschritt steht in `build_status`.
 * Auf der Website heißt der Baufortschritt seit jeher `status` -- die
 * Umbenennung passiert hier.
 */

/** Ausstattungspunkt, wie ihn das Backend zweisprachig ablegt. */
interface ListItemRow {
  glyph: CasaGlyph;
  label: { es: string; en: string };
}

interface HighlightRow extends ListItemRow {
  note: { es: string; en: string };
}

interface CasaImageRow {
  id: string;
  url: string;
  alt_es: string;
  alt_en: string;
  sort_order: number;
}

interface CasaTranslationRow {
  title: string;
  tagline: string;
  body: string[];
  bookNote: string;
}

interface CasaPublicRow {
  slug: string;
  build_status: CasaStatus;
  airbnb_url: string | null;
  beds: number;
  guests: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  amenities: ListItemRow[];
  highlights: HighlightRow[];
  translations: Partial<Record<'es' | 'en', CasaTranslationRow>>;
  images: CasaImageRow[];
  sort_order: number;
}

/**
 * Fehlt eine Sprache, greift die andere als Notnagel -- ein halb übersetztes
 * Haus soll den Build nicht anhalten.
 */
function pickTranslation(row: CasaPublicRow, lang: 'es' | 'en'): CasaTranslationRow {
  const own = row.translations?.[lang];
  if (own) return own;

  const fallback = row.translations?.[lang === 'es' ? 'en' : 'es'];
  if (fallback) return fallback;

  throw new Error(
    `Das Lehmhaus "${row.slug}" hat im veröffentlichten Stand keine Texte.\n` +
      'Im Backend unter /admin ausfüllen und neu veröffentlichen.',
  );
}

function toListItems(rows: ListItemRow[] | null, lang: 'es' | 'en'): CasaListItem[] {
  return (rows ?? []).map((r) => ({ glyph: r.glyph, label: r.label[lang] }));
}

function toHighlights(rows: HighlightRow[] | null, lang: 'es' | 'en'): CasaHighlight[] {
  return (rows ?? []).map((r) => ({
    glyph: r.glyph,
    label: r.label[lang],
    note: r.note[lang],
  }));
}

/** Leere Liste ist erlaubt: Stay.astro zeigt dann die Aquarell-Zeichnung. */
function toImages(rows: CasaImageRow[] | null, lang: 'es' | 'en'): CasaImage[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      url: r.url,
      alt: (lang === 'es' ? r.alt_es : r.alt_en) || '',
    }));
}

function toCasaText(row: CasaPublicRow, lang: 'es' | 'en'): CasaText {
  const t = pickTranslation(row, lang);
  return {
    title: t.title,
    tagline: t.tagline,
    body: t.body ?? [],
    amenities: toListItems(row.amenities, lang),
    highlights: toHighlights(row.highlights, lang),
    images: toImages(row.images, lang),
    bookNote: t.bookNote,
  };
}

function toCasa(row: CasaPublicRow): Casa {
  return {
    id: row.slug,
    status: row.build_status,
    facts: {
      beds: row.beds,
      guests: row.guests,
      area: Number(row.area),
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
    },
    ...(row.airbnb_url ? { airbnbUrl: row.airbnb_url } : {}),
    text: {
      es: toCasaText(row, 'es'),
      en: toCasaText(row, 'en'),
    },
  };
}

/** Nur veröffentlichte Lehmhäuser, in der im Backend gesetzten Reihenfolge. */
export async function fetchCasas(): Promise<Casa[]> {
  const { data, error } = await supabase
    .from('casas_public')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(
      'Die Lehmhäuser konnten nicht aus Supabase geladen werden.\n' +
        `Meldung der Datenbank: ${error.message}\n` +
        'Häufigste Ursache: Das Schema ist noch nicht eingespielt. Dann fehlt die ' +
        'View "casas_public" -- siehe SETUP-BACKEND.md, Abschnitt A oder B.',
    );
  }

  return (data as CasaPublicRow[]).map(toCasa);
}
