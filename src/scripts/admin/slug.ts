/**
 * Der Teil der öffentlichen Adresse, der aus dem Titel entsteht.
 *
 * v1 hängte an jeden Slug ein Zufallssuffix (`taller-de-barro-x7f2`, Problem
 * P15). Das stand für immer in der URL und war nirgends sichtbar. Jetzt wird
 * der Slug aus dem spanischen Titel abgeleitet; kollidiert er, kommt `-2`,
 * `-3` … dazu. Sichtbar und änderbar ist er unter „Ajustes avanzados".
 */
import { supabase } from '../../lib/supabase';

/** Kombinierende Akzente aus der NFD-Zerlegung. */
const COMBINING = /[̀-ͯ]/g;

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    // Akzente weg, n-Tilde wird zu n -- in einer URL das übliche Verhalten.
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Freier Slug für `base`, ohne die eigene Zeile mitzuzählen.
 *
 * Kostet eine Abfrage und läuft deshalb nur, wenn wirklich ein neuer Slug
 * entsteht -- nicht bei jedem Autospeichern. Geht die Abfrage schief, wird
 * `base` zurückgegeben: dann entscheidet der Unique-Index, und `errors.ts`
 * erklärt der Nutzerin, was zu tun ist.
 */
export async function ensureUniqueSlug(
  table: 'workshops' | 'casas',
  base: string,
  ownId: string,
): Promise<string> {
  if (!base) return base;

  const { data, error } = await supabase
    .from(table)
    .select('slug')
    .like('slug', `${base}%`)
    .neq('id', ownId);

  if (error || !data) return base;

  const taken = new Set((data as { slug: string }[]).map((r) => r.slug));
  if (!taken.has(base)) return base;

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Platzhalter für eine frisch angelegte Zeile, bis es einen Titel gibt. */
export function draftSlug(prefix: 'taller' | 'casa'): string {
  return `${prefix}-borrador-${crypto.randomUUID().slice(0, 8)}`;
}

export function isDraftSlug(slug: string): boolean {
  return /-borrador-[0-9a-f]{8}$/.test(slug);
}
