import { es, type Dict } from './es';
import { en } from './en';

export type Lang = 'es' | 'en';

const dicts: Record<Lang, Dict> = { es, en };

export function getDict(lang: Lang): Dict {
  return dicts[lang];
}

export type { Dict };
