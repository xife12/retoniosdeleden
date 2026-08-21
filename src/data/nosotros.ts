import type { Lang } from '../i18n';

/**
 * Daten der Seite "Nosotros" / "About us".
 *
 * Aufbau wie casas.ts/workshops.ts: technische Angaben sprachneutral
 * (generation, grupo), alle Texte in Record<Lang, string>.
 *
 * WICHTIG: Es gibt noch keine echten Fotos. Bis dahin zeichnet
 * PersonAvatar.astro einen abstrakten Aquarell-Platzhalter je nach
 * `generation`. Sobald ein Foto existiert, kann Persona um ein optionales
 * `photo`-Feld erweitert werden (analog zu CasaSlide.photo in casas.ts).
 */

/** Generationszugehörigkeit — steuert Farbton und Größe des Avatars. */
export type Generation = 'abuela' | 'padres' | 'hijos' | 'nietos';

export interface Persona {
  /** Stabiler Schlüssel, u. a. für den Avatar-Seed (Formvariation). */
  id: string;
  generation: Generation;
  /** true = mehrere Personen statt einer Einzelfigur (aktuell nur "los nietos"). */
  grupo?: boolean;
  name: Record<Lang, string>;
  role: Record<Lang, string>;
}

/** Einleitender Familientext, oben auf der Seite. */
export const familyIntro: Record<Lang, string> = {
  es: 'Una familia de cuatro generaciones y más de 60.000 abejas que opinan en todo. Los forjadores de la idea hace 15 años: Catalina, Stefan y la abuela Alba. Sus hijos Florian y Maxi, junto a Jasmin y los nietos, le van dando forma en la actualidad desde lejos.',
  en: 'A family of four generations and more than 60,000 bees that have an opinion about everything. The ones who forged the idea 15 years ago: Catalina, Stefan and grandmother Alba. Their children Florian and Maxi, together with Jasmin and the grandchildren, keep shaping it today from afar.',
};

/** Werte-/Philosophie-Absatz, unten auf der Seite. */
export const values: Record<Lang, string> = {
  es: 'Todo lo que crece acá crece despacio y a mano: sin químicos, con la paciencia de varias generaciones. No es solo una chacra, es un proyecto educativo — para nuestros hijos, nietos y para quien nos visite. Creemos que enseñar a observar la tierra vale tanto como lo que ella nos da.',
  en: 'Everything that grows here grows slowly and by hand: no chemicals, with the patience of several generations. This isn’t just a farm, it’s an educational project — for our children, grandchildren, and for whoever visits us. We believe that teaching people to observe the land is worth as much as what it gives us.',
};

export const personas: Persona[] = [
  {
    id: 'alba',
    generation: 'abuela',
    name: { es: 'Abuela Alba', en: 'Grandmother Alba' },
    role: {
      es: 'La raíz de todo. Sembró la primera idea (y, dicen, el primer árbol).',
      en: 'The root of it all. Planted the first idea (and, they say, the first tree).',
    },
  },
  {
    id: 'catalina',
    generation: 'padres',
    name: { es: 'Catalina', en: 'Catalina' },
    role: {
      es: 'Las manos y la voz de las abejas. Guía los talleres y cuida cada colmena.',
      en: 'The hands and voice of the bees. Leads the workshops and tends every hive.',
    },
  },
  {
    id: 'stefan',
    generation: 'padres',
    name: { es: 'Stefan', en: 'Stefan' },
    role: {
      es: 'Construye cada casa de barro con sus propias manos, barro a barro.',
      en: 'Builds every mud house with his own hands, mud brick by mud brick.',
    },
  },
  {
    id: 'florian',
    generation: 'hijos',
    name: { es: 'Florian', en: 'Florian' },
    role: {
      es: 'Sigue dando forma al proyecto desde lejos, sin perder el hilo.',
      en: 'Keeps shaping the project from afar, never losing the thread.',
    },
  },
  {
    id: 'maxi',
    generation: 'hijos',
    name: { es: 'Maxi', en: 'Maxi' },
    role: {
      es: 'Ayuda a que la chacra también viva online, entre otras ideas raras.',
      en: 'Helps the farm live online too, among other odd ideas.',
    },
  },
  {
    id: 'jasmin',
    generation: 'hijos',
    name: { es: 'Jasmin', en: 'Jasmin' },
    role: {
      es: 'Se sumó a la familia y ya no se imagina la chacra sin ella.',
      en: 'Joined the family and can’t imagine the farm without her anymore.',
    },
  },
  {
    id: 'nietos',
    generation: 'nietos',
    grupo: true,
    name: { es: 'Los nietos', en: 'The grandchildren' },
    role: {
      es: 'La generación que todavía no sabe que ya es parte de esto.',
      en: 'The generation that doesn’t yet know it’s already part of this.',
    },
  },
];

export interface NosotrosUI {
  eyebrow: string;
  intro: string;
  familyTitle: string;
  valuesKicker: string;
  /** Kurzer Hinweis über dem Stammbaum: dass man auf die Personen tippen kann. */
  arbolHint: string;
  /** Beschriftung des Schließen-Knopfs an der Personen-Karte. */
  arbolCerrar: string;
}

/**
 * UI-Beschriftungen der Seite, die nicht schon in src/i18n stehen
 * (der Seitentitel selbst kommt aus t.nav.nosotros).
 * Bewusst hier, nicht in src/i18n — der Text gehört zu diesem Datensatz.
 */
export const nosotrosUI: Record<Lang, NosotrosUI> = {
  es: {
    eyebrow: 'Cuatro generaciones',
    intro: 'Quiénes somos',
    familyTitle: 'La familia detrás de la chacra',
    valuesKicker: 'Cómo trabajamos',
    arbolHint: 'Tocá cada persona del árbol para conocerla.',
    arbolCerrar: 'Cerrar',
  },
  en: {
    eyebrow: 'Four generations',
    intro: 'Who we are',
    familyTitle: 'The family behind the farm',
    valuesKicker: 'How we work',
    arbolHint: 'Tap each person on the tree to meet them.',
    arbolCerrar: 'Close',
  },
};
