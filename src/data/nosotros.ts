import type { Lang } from '../i18n';

/**
 * Daten der Seite "Nosotros" / "Nuestro Panal".
 *
 * Aufbau wie casas.ts/workshops.ts: technische Angaben sprachneutral
 * (vinculo, pigmento, grupo), alle Texte in Record<Lang, string>.
 *
 * Die Darstellung ist eine WABE, kein Stammbaum. Daraus folgen zwei
 * Regeln, die dieses Datenmodell absichtlich durchsetzt:
 *
 *  1. Es gibt keine Rangordnung. Deshalb steuert `generation` nichts
 *     Sichtbares mehr — weder Größe noch Position. Alle Waben sind gleich
 *     groß. Das Feld bleibt erhalten, weil "vier Generationen" Teil der
 *     Geschichte ist, aber es ist reine Information, kein Steuersignal.
 *  2. Unterschieden wird nur über `vinculo` (Füllung der Wabe) und
 *     `pigmento` (Farbe nach Tätigkeit, nicht nach Alter).
 *
 * WICHTIG: Es gibt noch keine echten Fotos. Sobald eines existiert, kann
 * Persona um ein optionales `photo`-Feld erweitert werden (analog zu
 * CasaSlide.photo in casas.ts).
 *
 * ENTWURF: Die `detail`-Texte und die drei `vuelo`-Waben (vecinos,
 * voluntarios, escuelas) sind Vorschläge und müssen von der Familie
 * bestätigt oder ersetzt werden.
 */

/** Generationszugehörigkeit — reine Information, steuert nichts mehr. */
export type Generation = 'abuela' | 'padres' | 'hijos' | 'nietos';

/**
 * Art der Beteiligung — das Einzige, was die Wabe optisch unterscheidet.
 *  - `nucleo`: fest dabei. Ausgemalte Wabe.
 *  - `vuelo`: begleitet zeitweise. Wabe nur als Tuschekontur, Mitte offen.
 */
export type Vinculo = 'nucleo' | 'vuelo';

/** Pigment nach TÄTIGKEIT, nicht nach Generation. */
export type Pigmento = 'miel' | 'barro' | 'pistacho' | 'lavanda';

export interface Persona {
  /** Stabiler Schlüssel, u. a. für den Avatar-Seed (Formvariation). */
  id: string;
  /**
   * Platz der Zelle im Sechseckraster (Achsenkoordinaten).
   *
   * Warum nicht Zeilen und Spalten: die Wabe WÄCHST beim Scrollen, und
   * jede neue Zelle muss die bestehende Form berühren — sonst schwebt sie
   * daneben. Ob zwei Zellen aneinandergrenzen, ist in Achsenkoordinaten
   * eine Rechnung (`sonVecinas` unten); in einem Zeilenraster wäre es
   * Handarbeit und damit eine Fehlerquelle.
   */
  q: number;
  r: number;
  generation: Generation;
  vinculo: Vinculo;
  pigmento: Pigmento;
  /** true = mehrere Personen statt einer Einzelfigur. */
  grupo?: boolean;
  name: Record<Lang, string>;
  /** Eine Zeile, steht in der Wabe und oben auf der Karte. */
  role: Record<Lang, string>;
  /** Längerer Text der Detailansicht. Fehlt er, zeigt die Karte nur `role`. */
  detail?: Record<Lang, string>;
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
  /*
   * DIE REIHENFOLGE IST DIE ERZÄHLUNG. Beim Scrollen kommt eine Zelle
   * nach der anderen dazu, in genau dieser Folge — wer hier oben steht,
   * wird zuerst erzählt und sitzt im Kern der Wabe.
   *
   * Die erste Zelle liegt zwangsläufig in der Mitte, weil alles andere
   * um sie herum wächst. Deshalb steht dort Catalina, die den Stock
   * täglich führt, und nicht die Großmutter: eine Wabe hat kein Oben,
   * aber sie hat eine Mitte, und die soll nicht wie ein Ehrenplatz
   * aussehen. Alba wird als dritte erzählt.
   *
   * Wird hier umsortiert, müssen `q`/`r` mitwandern: jede neue Zelle
   * muss die bereits gesetzten berühren. `comprobarPanal()` prüft das
   * beim Bauen und bricht ab, wenn die Wabe aufreißen würde.
   */
  {
    id: 'catalina',
    q: 0,
    r: 0,
    generation: 'padres',
    vinculo: 'nucleo',
    pigmento: 'miel',
    name: { es: 'Catalina', en: 'Catalina' },
    role: {
      es: 'Las manos y la voz de las abejas. Guía los talleres y cuida cada colmena.',
      en: 'The hands and voice of the bees. Leads the workshops and tends every hive.',
    },
    detail: {
      es: 'Abre las colmenas sin guantes y sin apuro, y explica lo que ve mientras lo ve. La mayoría de las personas que visitan la chacra conocen su primera abeja de cerca gracias a ella.',
      en: 'She opens the hives without gloves and without hurry, explaining what she sees as she sees it. Most people who visit the farm meet their first close-up bee through her.',
    },
  },
  {
    id: 'stefan',
    q: 1,
    r: -1,
    generation: 'padres',
    vinculo: 'nucleo',
    pigmento: 'barro',
    name: { es: 'Stefan', en: 'Stefan' },
    role: {
      es: 'Construye cada casa de barro con sus propias manos, barro a barro.',
      en: 'Builds every mud house with his own hands, mud brick by mud brick.',
    },
    detail: {
      es: 'Saca la tierra del propio terreno, la prueba, la mezcla con arena y paja y la sube al muro. Las casas de la chacra no se compraron: se levantaron, y siguen levantándose.',
      en: 'He takes the earth from the land itself, tests it, mixes it with sand and straw and lifts it onto the wall. The houses here were not bought: they were raised, and they are still rising.',
    },
  },
  {
    id: 'alba',
    q: 0,
    r: -1,
    generation: 'abuela',
    vinculo: 'nucleo',
    pigmento: 'pistacho',
    name: { es: 'Abuela Alba', en: 'Grandmother Alba' },
    role: {
      es: 'La raíz de todo. Sembró la primera idea (y, dicen, el primer árbol).',
      en: 'The root of it all. Planted the first idea (and, they say, the first tree).',
    },
    detail: {
      es: 'Clavó un palo en la tierra sin más intención que ver qué pasaba, y la tierra respondió. Desde entonces todo lo que se planta acá se planta con esa misma pregunta: ¿y si crece?',
      en: 'She pushed a stick into the ground with no intention beyond seeing what would happen, and the ground answered. Everything planted here since carries the same question: what if it grows?',
    },
  },
  {
    id: 'florian',
    q: 1,
    r: 0,
    generation: 'hijos',
    vinculo: 'nucleo',
    pigmento: 'lavanda',
    name: { es: 'Florian', en: 'Florian' },
    role: {
      es: 'Sigue dando forma al proyecto desde lejos, sin perder el hilo.',
      en: 'Keeps shaping the project from afar, never losing the thread.',
    },
    detail: {
      es: 'La distancia no le impide estar en cada decisión importante. Piensa la chacra en años, no en temporadas — y suele ser el que pregunta qué pasa si esto sale bien.',
      en: 'Distance does not keep him out of any decision that matters. He thinks about the farm in years rather than seasons — and he is usually the one asking what happens if this works.',
    },
  },
  {
    id: 'maxi',
    q: 0,
    r: 1,
    generation: 'hijos',
    vinculo: 'nucleo',
    pigmento: 'lavanda',
    name: { es: 'Maxi', en: 'Maxi' },
    role: {
      es: 'Ayuda a que la chacra también viva online, entre otras ideas raras.',
      en: 'Helps the farm live online too, among other odd ideas.',
    },
    detail: {
      es: 'Todo lo que ves en esta página pasó por sus manos: los textos, los mapas dibujados, la abeja que te acompaña al bajar. La chacra existe en la tierra; acá existe una segunda vez.',
      en: 'Everything on this page passed through his hands: the words, the drawn maps, the bee that follows you down the page. The farm exists on the land; here it exists a second time.',
    },
  },
  {
    id: 'jasmin',
    q: -1,
    r: 1,
    generation: 'hijos',
    vinculo: 'nucleo',
    pigmento: 'pistacho',
    name: { es: 'Jasmin', en: 'Jasmin' },
    role: {
      es: 'Se sumó a la familia y ya no se imagina la chacra sin ella.',
      en: 'Joined the family and can’t imagine the farm without her anymore.',
    },
    detail: {
      es: 'Llegó de visita, como todo el mundo, y se quedó del otro lado: la que planta, la que ordena, la que se acuerda de lo que hay que hacer antes de que haga falta.',
      en: 'She came to visit, like everyone does, and ended up on the other side: the one who plants, who tidies, who remembers what needs doing before it needs doing.',
    },
  },
  {
    id: 'nietos',
    q: -1,
    r: 0,
    generation: 'nietos',
    vinculo: 'nucleo',
    pigmento: 'miel',
    grupo: true,
    name: { es: 'Los nietos', en: 'The grandchildren' },
    role: {
      es: 'La generación que todavía no sabe que ya es parte de esto.',
      en: 'The generation that doesn’t yet know it’s already part of this.',
    },
    detail: {
      es: 'Van a heredar árboles que todavía no dieron fruto y paredes que todavía no están secas. Por eso plantamos pistachos: para que alguien más los coseche.',
      en: 'They will inherit trees that have not fruited yet and walls that are not yet dry. That is why we plant pistachios: so that somebody else can harvest them.',
    },
  },
  {
    id: 'vecinos',
    q: 2,
    r: -1,
    generation: 'padres',
    vinculo: 'vuelo',
    pigmento: 'barro',
    grupo: true,
    name: { es: 'Los vecinos', en: 'The neighbours' },
    role: {
      es: 'Prestan una mano, un tractor o un consejo cuando hace falta.',
      en: 'Lend a hand, a tractor or a piece of advice when it is needed.',
    },
    detail: {
      es: 'En el campo nadie termina nada solo. Los vecinos aparecen el día que hay que mover algo pesado y se van antes de que uno alcance a agradecer.',
      en: 'Out here nobody finishes anything alone. The neighbours turn up on the day something heavy has to move, and leave before you manage to thank them.',
    },
  },
  {
    id: 'voluntarios',
    q: 0,
    r: -2,
    generation: 'hijos',
    vinculo: 'vuelo',
    pigmento: 'pistacho',
    grupo: true,
    name: { es: 'Los voluntarios', en: 'The volunteers' },
    role: {
      es: 'Vienen por una temporada y quedan en las paredes que ayudaron a levantar.',
      en: 'They come for a season and stay in the walls they helped raise.',
    },
    detail: {
      es: 'Algunos se quedan un mes, otros vuelven cada año. Cada pared de barro tiene manos de gente que ya no está acá, y eso también es la chacra.',
      en: 'Some stay a month, others come back every year. Every clay wall holds the hands of people who are no longer here, and that is part of the farm too.',
    },
  },
  {
    id: 'escuelas',
    q: -1,
    r: 2,
    generation: 'nietos',
    vinculo: 'vuelo',
    pigmento: 'miel',
    grupo: true,
    name: { es: 'Las escuelas', en: 'The schools' },
    role: {
      es: 'Llegan con treinta preguntas y se van con treinta y una.',
      en: 'They arrive with thirty questions and leave with thirty-one.',
    },
    detail: {
      es: 'Las visitas de escuela son el motivo por el que esto es un proyecto educativo y no solo una chacra. Ahí nació «Las abejas educan».',
      en: 'School visits are the reason this is an educational project and not only a farm. That is where “Las abejas educan” was born.',
    },
  },
];

/**
 * Die freien Zellen — kein Platzhalter für fehlende Daten, sondern die
 * Aussage: der Stock ist nicht fertig. Sie erscheinen erst im Schlussbild,
 * wenn man gerade zugesehen hat, wie sich alle anderen gefüllt haben.
 */
export const celdasLibres: { q: number; r: number }[] = [
  { q: -2, r: 1 },
  { q: 1, r: 1 },
  { q: -1, r: -1 },
];

/** Die sechs Nachbarschritte im Sechseckraster (spitze Zellen oben). */
const VECINDAD: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

function sonVecinas(a: { q: number; r: number }, b: { q: number; r: number }): boolean {
  return VECINDAD.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

/**
 * Prüft beim Bauen, dass die Wabe lückenlos wächst.
 *
 * Die Erzählung fügt Zelle für Zelle hinzu. Berührt eine neue Zelle die
 * bisherige Form nicht, schwebt sie im Nichts und das Bild ist kaputt.
 * Dieser Fehler wäre am Bildschirm sofort sichtbar, aber erst NACHDEM
 * jemand bis dorthin gescrollt hat — deshalb fällt er hier auf, beim
 * Bauen, und nicht dort.
 *
 * Läuft nur zur Bauzeit (Astro-Frontmatter), kostet also nichts im
 * Browser.
 */
export function comprobarPanal(): void {
  const puestas: { q: number; r: number; id: string }[] = [];

  for (const p of personas) {
    if (puestas.length && !puestas.some((v) => sonVecinas(v, p))) {
      throw new Error(
        `nosotros.ts: die Zelle von "${p.id}" (${p.q}, ${p.r}) berührt keine der ` +
          `bereits gesetzten Zellen. Die Wabe würde an dieser Stelle aufreißen.`,
      );
    }
    const choque = puestas.find((v) => v.q === p.q && v.r === p.r);
    if (choque) {
      throw new Error(
        `nosotros.ts: "${p.id}" und "${choque.id}" sitzen beide auf (${p.q}, ${p.r}).`,
      );
    }
    puestas.push({ q: p.q, r: p.r, id: p.id });
  }

  for (const libre of celdasLibres) {
    if (!puestas.some((v) => sonVecinas(v, libre))) {
      throw new Error(
        `nosotros.ts: die freie Zelle (${libre.q}, ${libre.r}) hängt nicht am Panal.`,
      );
    }
    if (puestas.some((v) => v.q === libre.q && v.r === libre.r)) {
      throw new Error(
        `nosotros.ts: die freie Zelle (${libre.q}, ${libre.r}) liegt auf einer Person.`,
      );
    }
  }
}

export interface NosotrosUI {
  eyebrow: string;
  intro: string;
  valuesKicker: string;
  /** Szene 0: die leere erste Zelle. */
  introTitulo: string;
  introTexto: string;
  /** Szene 11: das Schlussbild mit der vollständigen Wabe. */
  finalTitulo: string;
  finalTexto: string;
  /** Hinweis im Schlussbild, dass die Zellen antippbar sind. */
  finalHint: string;
  /** Art der Beteiligung, über dem Namen. */
  leyendaNucleo: string;
  leyendaVuelo: string;
  leyendaLibre: string;
}

/**
 * UI-Beschriftungen der Seite, die nicht schon in src/i18n stehen
 * (der Seitentitel selbst kommt aus t.nav.nosotros).
 * Bewusst hier, nicht in src/i18n — der Text gehört zu diesem Datensatz.
 */
export const nosotrosUI: Record<Lang, NosotrosUI> = {
  es: {
    eyebrow: 'Cuatro generaciones, una colmena',
    intro: 'Quiénes somos',
    valuesKicker: 'Cómo trabajamos',
    introTitulo: 'Así empieza un panal',
    introTexto: 'Una celda vacía y alguien que se anima a llenarla. Seguí bajando.',
    finalTitulo: 'El panal sigue creciendo',
    finalTexto: 'Quedan celdas libres. Siempre quedan.',
    finalHint: 'Tocá una celda para volver a leerla.',
    leyendaNucleo: 'Están todos los días',
    leyendaVuelo: 'Acompañan de a ratos',
    leyendaLibre: 'Celda libre',
  },
  en: {
    eyebrow: 'Four generations, one hive',
    intro: 'Who we are',
    valuesKicker: 'How we work',
    introTitulo: 'This is how a hive begins',
    introTexto: 'One empty cell and somebody willing to fill it. Keep scrolling.',
    finalTitulo: 'The hive keeps growing',
    finalTexto: 'There are still empty cells. There always are.',
    finalHint: 'Tap a cell to read it again.',
    leyendaNucleo: 'Here every day',
    leyendaVuelo: 'Alongside us now and then',
    leyendaLibre: 'An empty cell',
  },
};
