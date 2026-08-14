import { supabase } from './supabase';
import type { Casa, CasaFacts, CasaHighlight, CasaImage, CasaListItem, CasaStatus, CasaText } from '../data/casas';
import type { CasaGlyph } from '../data/casa-glyphs';
import type { Lang } from '../i18n';

interface BilingualText {
  es: string;
  en: string;
}

interface CasaAmenityRow {
  glyph: CasaGlyph;
  label: BilingualText;
}

interface CasaHighlightRow {
  glyph: CasaGlyph;
  label: BilingualText;
  note: BilingualText;
}

interface CasaTranslationRow {
  title: string;
  tagline: string;
  body: string[];
  bookNote: string;
}

interface CasaRow {
  id: string;
  slug: string;
  status: CasaStatus;
  archived: boolean;
  airbnb_url: string | null;
  beds: number;
  guests: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  amenities: CasaAmenityRow[];
  highlights: CasaHighlightRow[];
  translations: { es: CasaTranslationRow; en: CasaTranslationRow };
}

interface CasaImageRow {
  id: string;
  casa_id: string;
  url: string;
  alt_es: string;
  alt_en: string;
  sort_order: number;
}

function toFacts(row: CasaRow): CasaFacts {
  return {
    beds: row.beds,
    guests: row.guests,
    area: Number(row.area),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
  };
}

function toAmenities(row: CasaRow, lang: Lang): CasaListItem[] {
  return row.amenities.map((a) => ({ glyph: a.glyph, label: a.label[lang] }));
}

function toHighlights(row: CasaRow, lang: Lang): CasaHighlight[] {
  return row.highlights.map((h) => ({ glyph: h.glyph, label: h.label[lang], note: h.note[lang] }));
}

function toImages(rows: CasaImageRow[], lang: Lang): CasaImage[] {
  return rows.map((img) => ({
    id: img.id,
    url: img.url,
    alt: lang === 'es' ? img.alt_es : img.alt_en,
  }));
}

function toCasaText(row: CasaRow, images: CasaImageRow[], lang: Lang): CasaText {
  const t = row.translations[lang];
  return {
    title: t.title,
    tagline: t.tagline,
    body: t.body,
    bookNote: t.bookNote,
    amenities: toAmenities(row, lang),
    highlights: toHighlights(row, lang),
    images: toImages(images, lang),
  };
}

function toCasa(row: CasaRow, images: CasaImageRow[]): Casa {
  return {
    id: row.slug,
    status: row.status,
    facts: toFacts(row),
    airbnbUrl: row.airbnb_url ?? undefined,
    text: {
      es: toCasaText(row, images, 'es'),
      en: toCasaText(row, images, 'en'),
    },
  };
}

/** Nur nicht archivierte Häuser, für den öffentlichen Seiten-Build. */
export async function fetchCasas(): Promise<Casa[]> {
  const { data: casaRows, error: casaError } = await supabase
    .from('casas')
    .select('*')
    .eq('archived', false)
    .order('sort_order', { ascending: true });

  if (casaError) {
    throw new Error(`Lehmhäuser konnten nicht geladen werden: ${casaError.message}`);
  }

  const rows = casaRows as CasaRow[];
  if (rows.length === 0) return [];

  const { data: imageRows, error: imageError } = await supabase
    .from('casa_images')
    .select('*')
    .in(
      'casa_id',
      rows.map((r) => r.id),
    )
    .order('sort_order', { ascending: true });

  if (imageError) {
    throw new Error(`Bilder der Lehmhäuser konnten nicht geladen werden: ${imageError.message}`);
  }

  const imagesByCasaId = new Map<string, CasaImageRow[]>();
  for (const img of (imageRows ?? []) as CasaImageRow[]) {
    const list = imagesByCasaId.get(img.casa_id) ?? [];
    list.push(img);
    imagesByCasaId.set(img.casa_id, list);
  }

  return rows.map((row) => toCasa(row, imagesByCasaId.get(row.id) ?? []));
}
