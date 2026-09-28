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
      es: 'Las manos y la voz de las abejas. Guía «Las abejas educan» y cuida que todos en la colmena estén bien.',
      en: 'The hands and voice of the bees. Leads “Las abejas educan” and makes sure everyone in the hive is well.',
    },
    detail: {
      es: 'Abre las colmenas sin apuro y te va mostrando y explicando todo: te hace sentir que vos sos una abeja.',
      en: 'She opens the hives without hurry and shows and explains everything as she goes: she makes you feel like you are a bee yourself.',
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
      es: 'Tal vez la raíz más fuerte y profunda. Siempre sembrando ideas y apoyando.',
      en: 'Perhaps the strongest, deepest root. Always sowing ideas and lending support.',
    },
    detail: {
      es: 'Clavó un palo en la tierra, respondiéndole a Catalina la pregunta: ¿por dónde se empieza, cuando no hay nada? Un palo, un pájaro y una semilla le dieron vida a la chacra.',
      en: 'She pushed a stick into the ground, answering Catalina’s question: where do you begin when there is nothing? A stick, a bird and a seed brought the farm to life.',
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
      es: 'La distancia no le impide estar en el proceso de crecimiento del proyecto, y trae ideas muy modernas y sociales. Suele ser el que se pregunta: ¿qué pasa si esto sale bien?',
      en: 'Distance does not keep him out of the way the project grows, and he brings very modern, socially minded ideas. He is usually the one asking: what happens if this works?',
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
      es: 'El que mantiene la chacra viva en el mundo cibernético, para que todos nos vean.',
      en: 'The one who keeps the farm alive in the digital world, so everyone can see us.',
    },
    detail: {
      es: 'Todo lo que ves en esta página pasó por sus manos y fue construido con sus ideas: los textos, los mapas dibujados, Meli que te acompaña. Le da la voz y el eco a la chacra.',
      en: 'Everything you see on this page passed through his hands and was built from his ideas: the words, the drawn maps, Meli keeping you company. He gives the farm its voice and its echo.',
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
      es: 'Jamás se hubiera imaginado cuánto trabajo hay en una colmena para crecer y compartir.',
      en: 'Never would have imagined how much work goes into a hive to grow and to share.',
    },
    detail: {
      es: 'Llegó de visita, como todo el mundo, y se quedó alucinada con el aroma del panal. Ahora ayuda a darle vida al viaje de Luna y Meli con sus ilustraciones e ideas.',
      en: 'She came to visit, like everyone does, and was enchanted by the scent of the hive. Now she helps bring Luna and Meli’s journey to life with her illustrations and ideas.',
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
      es: 'La generación que descubre la libertad en la naturaleza de la chacra.',
      en: 'The generation discovering freedom in the nature of the farm.',
    },
    detail: {
      es: 'Como los pistachos, todavía tienen que crecer para dar sus frutos… pero ya sienten que pertenecer a un panal es algo dulce y aromático.',
      en: 'Like the pistachios, they still have some growing to do before they bear fruit… but they already feel that belonging to a hive is something sweet and fragrant.',
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
      es: 'Dan una mano, un tractor o un consejo cuando hace falta.',
      en: 'Give a hand, a tractor or a piece of advice when it is needed.',
    },
    detail: {
      es: 'En el campo nadie termina las cosas solo. Los vecinos siempre están, o aparecen el día que hay que mover algo pesado, arreglar la bomba de agua o alguna cosa más, y se van con una galletita en la mano o con un mate antes del atardecer.',
      en: 'Out here nobody finishes things alone. The neighbours are always around, or turn up on the day something heavy has to move, the water pump needs fixing or something else comes up, and they leave with a biscuit in hand or a mate before sunset.',
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
      es: 'Vienen por un tiempo y se quedan en las paredes que ayudaron a levantar, o en los árboles que plantaron.',
      en: 'They come for a while and stay in the walls they helped raise, or in the trees they planted.',
    },
    detail: {
      es: 'Algunos se quedan solo unos días, otros vuelven todos los años. Cada pared de barro tiene manos de gente que ya no está, y hay árboles que plantaron pasantes… Todo crece con todos.',
      en: 'Some stay only a few days, others come back every year. Every clay wall holds the hands of people who are no longer here, and some trees were planted by interns… Everything grows with everyone.',
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
      es: 'Llegan con treinta preguntas y se van con ojos brillantes de felicidad y ganas de más.',
      en: 'They arrive with thirty questions and leave with eyes shining with happiness, wanting more.',
    },
    detail: {
      es: 'Las visitas de escuela son el motivo por el que esto es un proyecto educativo y no solo una chacra. Ahí nació «Las abejas educan».',
      en: 'School visits are the reason this is an educational project and not only a farm. That is where “Las abejas educan” was born.',
    },
  },
  {
    /*
     * Neu am 28. September 2026. Liegt auf der bisher freien Zelle (1, 1)
     * und berührt Florian (1, 0) und Maxi (0, 1). Die zwei übrigen freien
     * Zellen bleiben: der Stock ist weiterhin nicht fertig.
     */
    id: 'familia',
    q: 1,
    r: 1,
    generation: 'padres',
    vinculo: 'vuelo',
    pigmento: 'lavanda',
    grupo: true,
    name: { es: 'La familia', en: 'The family' },
    role: {
      es: 'Vienen y se van. Traen ideas, arte, cerámica, consejos y buenos asados.',
      en: 'They come and go. They bring ideas, art, ceramics, advice and good barbecues.',
    },
    detail: {
      es: 'Cada uno, con su experiencia, nos apoya y ajusta el GPS del panal para que no perdamos la orientación.',
      en: 'Each of them, with their own experience, backs us up and adjusts the hive’s GPS so we never lose our bearings.',
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
  /**
   * Art der Beteiligung, über dem Namen -- NUR beim Umflug (vinculo ===
   * 'vuelo'). Der Kern hatte hier "Están todos los días" stehen; das war
   * eine Übertreibung, die nicht für jede Person im Kern stimmte, und ist
   * seit "Anpassungen 02" (18. September 2026) ersatzlos gestrichen. Die
   * Begleiter-Zeile bleibt: sie behauptet nichts Falsches, sondern sagt
   * gerade, dass diese Personen NICHT täglich da sind.
   */
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
    leyendaVuelo: 'Alongside us now and then',
    leyendaLibre: 'An empty cell',
  },
};
