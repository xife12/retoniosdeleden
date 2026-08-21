import type { Lang } from '../i18n';

import portada from '../assets/libro/01-portada.jpg';
import jardin from '../assets/libro/02-jardin.jpg';
import encuentro from '../assets/libro/03-encuentro.jpg';
import invitacion from '../assets/libro/04-invitacion.jpg';
import transformacion from '../assets/libro/05-transformacion.jpg';
import vuelo from '../assets/libro/06-vuelo.jpg';
import entrada from '../assets/libro/07-entrada.jpg';
import baile from '../assets/libro/08-baile.jpg';
import reina from '../assets/libro/09-reina.jpg';

/**
 * „Luna y el secreto de la colmena" von Catalina Marzorati.
 *
 * Leseprobe: die ersten neun Seiten. Der Text steht fest in den Bildern und
 * bleibt dort unangetastet; die Transkription hier dient der Sprachausgabe,
 * dem Alternativtext und der Suche. Reihenfolge und Transkription stammen aus
 * `bilder/SEITEN.md`.
 *
 * Alle Bilder sind 1536x1024, also exakt 3:2. Die Spiel-Overlays rechnen mit
 * dieser Bildfläche in einem viewBox-Raum von 300x200 — deshalb sind alle
 * Koordinaten unten in diesem Raster angegeben und sitzen bei jeder
 * Bildschirmgröße an derselben Stelle im Bild.
 */

/** Zone des Abstiegs. Steuert Licht, Hintergrund und Partikeldichte. */
export type Zone = 'pradera' | 'umbral' | 'colmena' | 'corazon';

/** Ein Mitmach-Moment. Jede Seite außer dem Titel hat einen. */
export type Juego =
  | 'ojos'
  | 'zumbido'
  | 'plato'
  | 'transformacion'
  | 'colmena'
  | 'larvas'
  | 'baile'
  | 'guardianas';

export interface KnowledgeCard {
  /** Position im Bild in Prozent, damit der Punkt bei jeder Größe sitzt. */
  x: number;
  y: number;
  title: Record<Lang, string>;
  text: Record<Lang, string>;
  /** Bezug zur echten Chacra. Optional, aber wo möglich gesetzt. */
  chacra?: Record<Lang, string>;
}

export interface BookPage {
  n: number;
  img: ImageMetadata;
  zone: Zone;
  /** Spanischer Seitentext, wortgetreu wie im Bild abgedruckt. */
  texto: string;
  /** Für Sprachausgabe geglättet: Tippfehler korrigiert, Sprecherstriche entfernt. */
  voz: string;
  /** Kapitelname für die Wabennavigation. */
  capitulo: Record<Lang, string>;
  cards: KnowledgeCard[];
  juego?: Juego;
  /**
   * Ob die Seite in der Leseprobe gezeigt wird. Default (Feld weggelassen
   * oder `true`) = aktiv/sichtbar. `false` archiviert die Seite: Texte,
   * Bild-Referenz und `n` bleiben im Datensatz erhalten (Narration/Audio
   * bleiben dadurch weiter korrekt zugeordnet), aber sie wird weder
   * gerendert noch in `totalCards`/`totalJuegos` mitgezählt.
   */
  activo?: boolean;
}

export const pages: BookPage[] = [
  {
    n: 1,
    img: portada,
    zone: 'pradera',
    texto:
      'Luna y el secreto de la colmena. Un viaje por el mundo de las abejas. Por Catalina Marzorati.',
    voz: 'Luna y el secreto de la colmena. Un viaje por el mundo de las abejas. Por Catalina Marzorati.',
    capitulo: { es: 'Portada', en: 'Cover' },
    cards: [
      {
        x: 30,
        y: 47,
        title: { es: 'Esa soy yo', en: 'That is me' },
        text: {
          es: 'La abeja del girasol soy yo, Meli. La misma que te viene guiando por esta página. Catalina me dibujó primero acá, en el libro.',
          en: 'The bee on the sunflower is me, Meli. The same one guiding you through this website. Catalina drew me here first, in the book.',
        },
        chacra: {
          es: 'Catalina plantó los primeros pistachos de esta chacra y después escribió el cuento.',
          en: 'Catalina planted the first pistachio trees on this farm, and then wrote the story.',
        },
      },
    ],
  },
  {
    n: 2,
    activo: false,
    img: jardin,
    zone: 'pradera',
    texto:
      'Luna estaba sentada en el jardín. La tierra estaba tibia por el sol. Flores amarillas, rojas y violetas la rodeaban por todas partes. Què bien huelen, suspiró Luna.',
    voz: 'Luna estaba sentada en el jardín. La tierra estaba tibia por el sol. Flores amarillas, rojas y violetas la rodeaban por todas partes. ¡Qué bien huelen!, suspiró Luna.',
    capitulo: { es: 'En el jardín', en: 'In the garden' },
    juego: 'ojos',
    cards: [
      {
        x: 21,
        y: 43,
        title: { es: 'Flores con pista de aterrizaje', en: 'Flowers with landing strips' },
        text: {
          es: 'Las abejas ven la luz ultravioleta. Para ellas, muchas flores tienen líneas brillantes que apuntan al centro, como la señalización de una pista.',
          en: 'Bees see ultraviolet light. To them many flowers carry bright lines pointing to the centre, like the markings on a runway.',
        },
        chacra: {
          es: 'La caléndula del noroeste de la chacra tiene una de las pistas más marcadas.',
          en: 'The calendula in the northwest of the farm has one of the clearest landing strips.',
        },
      },
      {
        x: 88,
        y: 30,
        title: { es: 'El rojo no existe', en: 'Red does not exist' },
        text: {
          es: 'Ese rojo de las amapolas, para mí es casi negro. Por eso las flores que nos buscan a nosotras son amarillas, blancas o violetas, nunca rojas.',
          en: 'The red of those poppies looks almost black to me. That is why the flowers that court us are yellow, white or violet, never red.',
        },
      },
    ],
  },
  {
    n: 3,
    activo: false,
    img: encuentro,
    zone: 'pradera',
    texto:
      'De repente, un suave zumbido rompió el silenclo. Bzzz... Hola, abejita, dijo Luna en voz baja. ¿Què estás haciendo? La abeja se dio vuétte, miró a Luna y ensequida continuó trabgjande muy atareida. Estoy recogiendo nèctar y polen, zumbó igual amabhmante. ¡Sin mi, no habria flores ni frutas en tooodo el mundo!',
    voz: 'De repente, un suave zumbido rompió el silencio. ¡Bzzz! Hola, abejita, dijo Luna en voz baja. ¿Qué estás haciendo? La abeja se dio vuelta, miró a Luna y enseguida continuó trabajando, muy atareada. Estoy recogiendo néctar y polen, zumbó amablemente. ¡Sin mí no habría flores ni frutas en todo el mundo!',
    capitulo: { es: 'El encuentro', en: 'The meeting' },
    juego: 'zumbido',
    cards: [
      {
        x: 40,
        y: 62,
        title: { es: 'Néctar y polen no son lo mismo', en: 'Nectar and pollen are not the same' },
        text: {
          es: 'El néctar es el jugo dulce de la flor y se convierte en miel. El polen es el polvito amarillo y es la carne y la leche de la colmena: de ahí sacan las proteínas.',
          en: 'Nectar is the sweet juice of the flower and becomes honey. Pollen is the yellow dust and is the hive’s meat and milk: that is where the protein comes from.',
        },
      },
      {
        x: 60,
        y: 22,
        title: { es: 'Tres erres de trabajo', en: 'A working life' },
        text: {
          es: 'Una obrera de verano vive unas seis semanas y cambia de oficio varias veces: primero limpia, después cuida larvas, después construye, y recién al final sale a volar.',
          en: 'A summer worker lives about six weeks and changes job several times: first she cleans, then she nurses larvae, then she builds, and only at the end does she fly out.',
        },
      },
    ],
  },
  {
    n: 4,
    img: invitacion,
    zone: 'pradera',
    texto:
      'Luna abrió los ojos con sorpresa. ¿Enserió? ¿Entonces eres muy importante! La abeja un poco orgullósa se agrandó un poquito y movió sus alas apurada para todos lados. ¿Quieres venir conmigo? ¿Quieres que te muestre nuestro mundo?',
    voz: 'Luna abrió los ojos con sorpresa. ¿En serio? ¡Entonces eres muy importante! La abeja, un poco orgullosa, se agrandó un poquito y movió sus alas apurada para todos lados. ¿Quieres venir conmigo? ¿Quieres que te muestre nuestro mundo?',
    capitulo: { es: 'La invitación', en: 'The invitation' },
    juego: 'plato',
    cards: [
      {
        x: 62,
        y: 40,
        title: { es: 'Una de cada tres cucharadas', en: 'One in every three spoonfuls' },
        text: {
          es: 'La abeja tenía razón en ponerse orgullosa: cerca de un tercio de todo lo que comemos existe porque alguien lo polinizó.',
          en: 'The bee had every right to be proud: close to a third of everything we eat exists because something pollinated it.',
        },
        chacra: {
          es: 'En la chacra pasa lo mismo con la lavanda, la caléndula y los frutales del anillo.',
          en: 'The same is true on the farm for the lavender, the calendula and the fruit trees inside the ring.',
        },
      },
    ],
  },
  {
    n: 5,
    img: transformacion,
    zone: 'umbral',
    texto:
      'Luna asintió medio tímida y de repente, todo empezó a brillar... Se sintió tan liviana... ¡Y sin esperarlo, era tan pequeña como una abeja!',
    voz: 'Luna asintió medio tímida y, de repente, todo empezó a brillar. Se sintió tan liviana. ¡Y sin esperarlo, era tan pequeña como una abeja!',
    capitulo: { es: 'La transformación', en: 'The transformation' },
    juego: 'transformacion',
    cards: [
      {
        x: 24,
        y: 33,
        title: { es: 'Chiquita de verdad', en: 'Really small' },
        text: {
          es: 'Una obrera pesa como una gota de lluvia: un décimo de gramo. Y aun así puede volver a casa cargando casi la mitad de su propio peso.',
          en: 'A worker weighs about as much as a raindrop: a tenth of a gram. Even so she can fly home carrying almost half her own weight.',
        },
      },
    ],
  },
  {
    n: 6,
    activo: false,
    img: vuelo,
    zone: 'umbral',
    texto:
      'Luna flotaba livianita por el aire. Meli, la pequeña abeja, volaba a su lado. ¿Ves esa cajita ahí abajo? zumbò. Es nuestra colmena. Ahí vivimos.',
    voz: 'Luna flotaba livianita por el aire. Meli, la pequeña abeja, volaba a su lado. ¿Ves esa cajita ahí abajo?, zumbó. Es nuestra colmena. Ahí vivimos.',
    capitulo: { es: 'El vuelo', en: 'The flight' },
    juego: 'colmena',
    cards: [
      {
        x: 42,
        y: 36,
        title: { es: 'Meli, la misma de siempre', en: 'Meli, the very same' },
        text: {
          es: 'Acá aparece su nombre por primera vez. Es la misma Meli que te viene guiando por esta página desde el principio.',
          en: 'Here her name appears for the first time. This is the same Meli who has been guiding you through this website from the start.',
        },
        chacra: {
          es: 'Catalina, la autora del libro, es quien plantó los primeros pistachos de la chacra.',
          en: 'Catalina, the author of the book, is the same person who planted the first pistachio trees on the farm.',
        },
      },
      {
        x: 82,
        y: 71,
        title: { es: 'Tres vueltas al mundo', en: 'Three times around the world' },
        text: {
          es: 'Para llenar un frasco de miel, las abejas de una colmena vuelan juntas unos ciento veinte mil kilómetros. Tres vueltas a la Tierra por un frasco.',
          en: 'To fill one jar of honey, the bees of a hive fly some hundred and twenty thousand kilometres together. Three times around the Earth for a single jar.',
        },
        chacra: {
          es: 'En Retoños del Edén las colmenas están en el rincón noroeste, al lado del campo de caléndula.',
          en: 'At Retoños del Edén the hives sit in the northwest corner, beside the calendula field.',
        },
      },
    ],
  },
  {
    n: 7,
    img: entrada,
    zone: 'colmena',
    texto:
      'Rapidamente volaron por una abertura estrecha y entraron en el cajón verde. ...un aroma dulle a cera y miel... Uaauu, exclamó Luna asombrada.',
    voz: 'Rápidamente volaron por una abertura estrecha y entraron en el cajón verde. Un aroma dulce a cera y miel. ¡Uaauu!, exclamó Luna asombrada.',
    capitulo: { es: 'En la colmena', en: 'In the hive' },
    juego: 'larvas',
    cards: [
      {
        x: 88,
        y: 27,
        title: { es: 'Celdas de seis lados', en: 'Six-sided cells' },
        text: {
          es: 'El hexágono es la forma que guarda más miel con menos cera. Las abejas la resolvieron mucho antes que cualquier ingeniero.',
          en: 'The hexagon is the shape that stores the most honey with the least wax. Bees solved that long before any engineer did.',
        },
      },
      {
        x: 55,
        y: 30,
        title: { es: 'Cera hecha con el cuerpo', en: 'Wax made by the body' },
        text: {
          es: 'La cera sale de unas glándulas en la panza de las obreras jóvenes. Para hacer un kilo de cera comen unos ocho kilos de miel.',
          en: 'Wax comes from glands on the belly of young workers. To make one kilo of wax they eat around eight kilos of honey.',
        },
      },
    ],
  },
  {
    n: 8,
    activo: false,
    img: baile,
    zone: 'colmena',
    texto:
      'Frente a ella había una enorme casa hecha de celdas de cera. En todos lados habia abejas trabajando: volaban, límpiaban, construíàn y bailaban. ¿Por qué bailan las abejas? preguntô Luna. Ese es nuestro baile del meneo, explicó Meli. Asi las recoléctoras muestran a las obreras dônde están las flores más ricas y sabrosas.',
    voz: 'Frente a ella había una enorme casa hecha de celdas de cera. En todos lados había abejas trabajando: volaban, limpiaban, construían y bailaban. ¿Por qué bailan las abejas?, preguntó Luna. Ese es nuestro baile del meneo, explicó Meli. Así las recolectoras muestran a las obreras dónde están las flores más ricas y sabrosas.',
    capitulo: { es: 'El baile del meneo', en: 'The waggle dance' },
    juego: 'baile',
    cards: [
      {
        x: 16,
        y: 30,
        title: { es: 'Adentro está oscuro', en: 'Inside it is dark' },
        text: {
          es: 'En la colmena no se ve nada. Las otras abejas no miran el baile: lo tocan con las antenas y lo escuchan por la vibración de la cera.',
          en: 'Inside the hive it is pitch dark. The other bees do not watch the dance: they touch it with their antennae and feel it through the wax.',
        },
      },
    ],
  },
  {
    n: 9,
    activo: false,
    img: reina,
    zone: 'corazon',
    texto:
      'De repente una abeja muy grande y elegante se acercó lentamente. Todas las abejas siguen trabajando sin sentirse molestadas. Bienvenida, Luna, dijo con una voz suave y dulce. Su perfume rodeǒ a Luna, el mismo que ella habia notado al entrar a la colmena.',
    voz: 'De repente, una abeja muy grande y elegante se acercó lentamente. Todas las abejas siguieron trabajando sin sentirse molestadas. Bienvenida, Luna, dijo con una voz suave y dulce. Su perfume rodeó a Luna, el mismo que ella había notado al entrar a la colmena.',
    capitulo: { es: 'La reina', en: 'The queen' },
    juego: 'guardianas',
    cards: [
      {
        x: 42,
        y: 30,
        title: { es: 'Dos mil huevos por día', en: 'Two thousand eggs a day' },
        text: {
          es: 'La reina pone más huevos por día de lo que pesa ella misma. En verano no para nunca, y todas las abejas del cuadro son hijas suyas.',
          en: 'The queen lays more eggs a day than she weighs herself. In summer she never stops, and every bee on the frame is her daughter.',
        },
      },
      {
        x: 76,
        y: 62,
        title: { es: 'El perfume de la casa', en: 'The perfume of the house' },
        text: {
          es: 'Ese perfume que rodea a Luna es de verdad: la reina reparte su olor por toda la colmena y ese olor es el documento de identidad de cada abeja.',
          en: 'That perfume around Luna is real: the queen spreads her scent through the whole hive, and that scent is every bee’s identity card.',
        },
        chacra: {
          es: 'Cuando abrimos una colmena en el taller, ese aroma a cera tibia es lo primero que se siente.',
          en: 'When we open a hive in the workshop, that warm wax smell is the very first thing you notice.',
        },
      },
    ],
  },
];

/**
 * Der Abstieg. `depth` (0…1) steuert Vignette, Farbschleier und Pollendichte;
 * `bg` ist der Seitenhintergrund, `marco` der Rahmen um das Blatt.
 * Die Spanne geht bewusst von hellem Wiesenlicht bis zu tiefem Wabengold,
 * damit der Unterschied zwischen Seite 1 und Seite 9 sofort sichtbar ist.
 */
export interface ZoneStyle {
  /** Der Grund, auf dem das Blatt liegt. Wird nach unten hin dunkel. */
  bg: string;
  /** Das Papier des Blattes selbst. Wird nach unten hin wärmer. */
  papel: string;
  depth: number;
  nombre: Record<Lang, string>;
}

export const zones: Record<Zone, ZoneStyle> = {
  pradera: {
    bg: '#e6f0dc',
    papel: '#fbf6ec',
    depth: 0,
    nombre: { es: 'La pradera', en: 'The meadow' },
  },
  umbral: {
    bg: '#f0c874',
    papel: '#fdf1dc',
    depth: 0.34,
    nombre: { es: 'El umbral', en: 'The threshold' },
  },
  colmena: {
    bg: '#a9660f',
    papel: '#f8e6bd',
    depth: 0.7,
    nombre: { es: 'La colmena', en: 'The hive' },
  },
  corazon: {
    bg: '#4e2a05',
    papel: '#f2d59f',
    depth: 1,
    nombre: { es: 'El corazón', en: 'The heart' },
  },
};

/** Rückwärtskompatibel: nur noch die reinen Hintergrundfarben. */
export const zoneColors: Record<Zone, string> = {
  pradera: zones.pradera.bg,
  umbral: zones.umbral.bg,
  colmena: zones.colmena.bg,
  corazon: zones.corazon.bg,
};

/* ============================================================
   Beschriftungen
   ============================================================ */

interface Fila {
  /** Kurzname im Sammelheft. */
  logro: string;
}

export interface LibroUI {
  eyebrow: string;
  title: string;
  subtitle: string;
  author: string;
  intro: string;
  /** Kurzer Hinweis, dass nur eine Auswahl von Seiten gezeigt wird. */
  excerpto: string;
  start: string;
  pageOf: string;
  read: string;
  readStop: string;
  readAgain: string;
  voiceLabel: string;
  voiceHint: string;
  autoLabel: string;
  cardHint: string;
  cardKicker: string;
  cardClose: string;
  chacraLabel: string;
  zoomLabel: string;
  zoomHint: string;
  moreInBook: string;
  found: string;
  playHint: string;
  againLabel: string;
  soundOn: string;
  soundOff: string;
  depthLabel: string;
  /** Sammelheft */
  carnetTitle: string;
  carnetLead: string;
  carnetEmpty: string;
  carnetOpen: string;
  carnetClose: string;
  /** Platzhalter {a} und {b}. */
  carnetCount: string;
  carnetSaberes: string;
  carnetPruebas: string;
  /** Versprechen auf dem Einstieg (noch nichts erreicht) */
  promesaJuegos: string;
  promesaCartas: string;
  /** Spiele */
  juegos: {
    ojos: {
      title: string;
      hint: string;
      button: string;
      active: string;
      meli: string;
      fact: string;
      compareHint: string;
      eyesYou: string;
      eyesMe: string;
    } & Fila;
    zumbido: {
      title: string;
      hint: string;
      button: string;
      go: string;
      you: string;
      me: string;
      unit: string;
      /** Platzhalter {n}. */
      result: string;
      fact: string;
      sound: string;
    } & Fila;
    plato: {
      title: string;
      hint: string;
      stays: string;
      goes: string;
      /** Platzhalter {q} und {t}. */
      done: string;
      fact: string;
      items: { name: string; poliniza: boolean; meli: string }[];
    } & Fila;
    transformacion: {
      title: string;
      hint: string;
      holdCta: string;
      more: string;
      done: string;
      count: string;
      parts: { name: string; meli: string }[];
    } & Fila;
    colmena: {
      title: string;
      hint: string;
      button: string;
      guess: string;
      low: string;
      high: string;
      close: string;
      fact: string;
      unit: string;
    } & Fila;
    larvas: {
      title: string;
      hint: string;
      jalea: string;
      pan: string;
      pick: string;
      step1: string;
      step2: string;
      again: string;
      reina: string;
      obrera: string;
      larva: string;
      larvaReal: string;
      msgReina: string;
      msgObrera: string;
      msgCeldaPan: string;
      dosReinas: string;
      done: string;
      fact: string;
    } & Fila;
    baile: {
      title: string;
      hint: string;
      angle: string;
      distance: string;
      near: string;
      far: string;
      send: string;
      dancing: string;
      win: string;
      miss: string;
      fact: string;
      sun: string;
      outside: string;
      inside: string;
    } & Fila;
    guardianas: {
      title: string;
      hint: string;
      yes: string;
      no: string;
      smellHome: string;
      smellStrange: string;
      done: string;
      fact: string;
      arrivals: { name: string; enter: boolean; meli: string }[];
    } & Fila;
  };
  /** Abschluss */
  endTitle: string;
  endText: string;
  endBookTitle: string;
  endBookText: string;
  endBookCta: string;
  endSchoolTitle: string;
  endSchoolText: string;
  endSchoolCta: string;
  endWorkshopTitle: string;
  endWorkshopText: string;
  endWorkshopCta: string;
  backHome: string;
  rights: string;
}

export const libroUI: Record<Lang, LibroUI> = {
  es: {
    eyebrow: 'Un cuento de Catalina Marzorati',
    title: 'Luna y el secreto de la colmena',
    subtitle: 'Un viaje por el mundo de las abejas',
    author: 'Catalina Marzorati',
    intro:
      'Luna se sienta en el jardín, escucha un zumbido y termina siendo del tamaño de una abeja. Yo la acompañé en ese viaje. Ahora te toca a vos: bajá conmigo hasta el corazón de la colmena.',
    excerpto: 'Este es un adelanto del libro completo.',
    start: 'Empezar el viaje',
    pageOf: 'Página',
    read: 'Que me lea Meli',
    readStop: 'Parar',
    readAgain: 'De nuevo',
    voiceLabel: 'Elegir voz',
    voiceHint: 'Probá otra voz si esta suena muy de robot.',
    autoLabel: 'Seguir sola',
    cardHint: 'Buscá las luces en el dibujo',
    cardKicker: '¿Sabías que...?',
    cardClose: 'Cerrar',
    chacraLabel: 'En la chacra',
    zoomLabel: 'Ver de cerca',
    zoomHint: 'Arrastrá para recorrer la página',
    moreInBook: 'Y el libro sigue',
    found: 'Ya lo encontraste',
    playHint: 'Tocá para jugar',
    againLabel: 'Otra vez',
    soundOn: 'Con sonido',
    soundOff: 'Sin sonido',
    depthLabel: 'Profundidad',
    carnetTitle: 'Tu carnet de abeja',
    carnetLead: 'Todo lo que fuiste descubriendo mientras leías.',
    carnetEmpty: 'Todavía está en blanco. Tocá las luces del dibujo y jugá con Meli.',
    carnetOpen: 'Ver mi carnet',
    carnetClose: 'Seguir leyendo',
    carnetCount: '{a} de {b}',
    carnetSaberes: 'Secretos encontrados',
    carnetPruebas: 'Pruebas superadas',
    promesaJuegos: 'cosas para hacer',
    promesaCartas: 'secretos escondidos',
    juegos: {
      ojos: {
        logro: 'Viste el jardín con ojos de abeja',
        title: 'Los ojos de Meli',
        hint: 'Tocá el ojo y mirá el mismo jardín como lo veo yo.',
        button: 'Mirar con mis ojos',
        active: 'Volver a tus ojos',
        meli: 'Yo no veo el rojo. Pero veo el ultravioleta: cada flor me pinta la pista de aterrizaje.',
        fact:
          'Es verdad: las abejas ven ultravioleta y no ven el rojo. Muchas flores tienen dibujos que solo aparecen bajo esa luz, y todos apuntan al néctar.',
        compareHint: 'La misma flor, mirada de dos maneras.',
        eyesYou: 'con tus ojos',
        eyesMe: 'con los míos',
      },
      zumbido: {
        logro: 'Mediste tu zumbido contra el mío',
        title: '¿De dónde sale el Bzzz?',
        hint: 'De la boca no. Tocá la flor lo más rápido que puedas durante cinco segundos.',
        button: 'Empezar a batir',
        go: '¡Dale, dale, dale!',
        you: 'vos',
        me: 'Meli',
        unit: 'por segundo',
        result: 'Batiste {n} veces por segundo.',
        fact:
          'Mis alas hacen doscientos treinta batidos por segundo. Tan rápido que el aire suena: eso es el zumbido.',
        sound: 'zumbido',
      },
      plato: {
        logro: 'Vaciaste el plato sin abejas',
        title: 'El plato sin abejas',
        hint: 'Sacá de la mesa lo que desaparecería si no estuviéramos nosotras.',
        stays: 'se queda',
        goes: 'desaparece',
        done: 'De {t} quedaron {q}.',
        fact:
          'Una de cada tres cucharadas de lo que comés existe porque alguien polinizó esa planta. Casi siempre, alguien con alas.',
        items: [
          {
            name: 'manzana',
            poliniza: true,
            meli: 'Sin nosotras no hay ni una manzana. Cada flor necesita varias visitas.',
          },
          {
            name: 'almendra',
            poliniza: true,
            meli: 'La almendra depende de nosotras casi al cien por ciento. Sin abejas, no existe.',
          },
          {
            name: 'zapallo',
            poliniza: true,
            meli: 'El zapallo tiene flores macho y flores hembra. Alguien tiene que llevar el polen de una a otra.',
          },
          {
            name: 'arándano',
            poliniza: true,
            meli: 'A este hay que sacudirlo para que suelte el polen. Nosotras lo hacemos zumbando.',
          },
          {
            name: 'café',
            poliniza: true,
            meli: 'Café va a seguir habiendo, pero mucho menos y más chiquito. Ese se queda a medias.',
          },
          {
            name: 'pan de trigo',
            poliniza: false,
            meli: 'Ese se queda: al trigo lo poliniza el viento, no hace falta que vayamos nosotras.',
          },
          {
            name: 'arroz',
            poliniza: false,
            meli: 'El arroz también se arregla con el viento. Se queda en el plato.',
          },
          {
            name: 'leche',
            poliniza: false,
            meli: 'La leche se queda... aunque la vaca come alfalfa, y a la alfalfa la polinizamos nosotras.',
          },
        ],
      },
      transformacion: {
        logro: 'Armaste un cuerpo de abeja',
        title: 'Armá tu cuerpo de abeja',
        hint: 'Mantené apretado. La luz de polen va a hacer el resto.',
        holdCta: 'Mantené apretado',
        more: 'Todavía te falta algo, ¿seguimos?',
        done: 'Ya sos una abeja.',
        count: 'Cinco ojos, cuatro alas, dos antenas, seis patas.',
        parts: [
          {
            name: '4 alas',
            meli: 'Cuatro, no dos. Se enganchan de a pares para volar más fuerte.',
          },
          {
            name: '5 ojos',
            meli: 'Dos grandes y tres chiquitos arriba. Con ellos encuentro el sol aunque esté nublado.',
          },
          {
            name: '2 antenas',
            meli: 'Con estas huelo el mundo. Una flor la reconozco antes de verla.',
          },
          {
            name: '6 patas con cestas',
            meli: 'En las de atrás llevo el polen. Son como dos canastas.',
          },
        ],
      },
      colmena: {
        logro: 'Adivinaste cuántas viven en la cajita',
        title: '¿Cuántas viven ahí adentro?',
        hint: 'Mové el dedo y arriesgá un número. Después abrimos la cajita.',
        button: 'Abrir la cajita',
        guess: 'Yo digo',
        low: 'Muchas más. Seguí subiendo.',
        high: 'Uy, tantas no entramos.',
        close: '¡Casi justo!',
        fact:
          'En verano vivimos unas sesenta mil en una sola caja, y casi todas somos hermanas. Una reina, unos pocos zánganos, y el resto obreras.',
        unit: 'abejas',
      },
      larvas: {
        logro: 'Descubriste quién decide la reina',
        title: 'La comida decide quién sos',
        hint: 'Elegí un alimento y dáselo a una larva. Fijate qué pasa.',
        jalea: 'jalea real',
        pan: 'pan de abeja',
        pick: 'Ahora tocá una larva',
        step1: 'Elegí la comida',
        step2: 'Tocá una larva',
        again: 'Vaciar el cuadro',
        reina: 'reina',
        obrera: 'obrera',
        larva: 'Larva',
        larvaReal: 'Larva en celda real',
        msgReina: 'Esa va a ser reina. Cuando crezca va a poner dos mil huevos por día.',
        msgObrera:
          'Esa se hace obrera: va a limpiar, cuidar larvas, construir cera y recién al final salir a volar.',
        msgCeldaPan:
          'Mirá qué curioso: la celda era de reina, pero con pan de abeja sale una obrera igual. Decide el plato, no la cuna.',
        dosReinas:
          '¡Ay! Ahora tenemos dos reinas y nadie que junte néctar. La comida decide quién sos, no el huevo.',
        done: 'Todas empezaron iguales. Lo único distinto fue el plato.',
        fact:
          'Todas las larvas comen jalea real los primeros tres días. Si siguen comiéndola, se hacen reinas; si pasan al pan de abeja, se hacen obreras. El huevo es el mismo.',
      },
      baile: {
        logro: 'Bailaste el meneo como una recolectora',
        title: 'Bailá vos el meneo',
        hint: 'Arrastrá para apuntar hacia la flor y elegí qué tan lejos está. El sol siempre está arriba.',
        angle: 'Hacia',
        distance: 'Qué tan lejos',
        near: 'cerquita',
        far: 'lejísimos',
        send: 'Mandar a las obreras',
        dancing: 'Meli está bailando...',
        win: '¡Encontraron la flor!',
        miss: 'Se fueron para otro lado. Movelo un poquito y probá de nuevo.',
        fact:
          'La abeja baila el ángulo entre el sol y la flor, y cuanto más largo es el meneo, más lejos está. Es el único lenguaje simbólico conocido fuera de los humanos.',
        sun: 'sol',
        outside: 'afuera',
        inside: 'adentro, a oscuras',
      },
      guardianas: {
        logro: 'Cuidaste la puerta de la colmena',
        title: 'Vos sos la guardiana',
        hint: 'Cinco quieren entrar. No mires cómo son: mirá a qué huelen.',
        yes: 'Dejar pasar',
        no: 'No pasa',
        smellHome: 'huele a casa',
        smellStrange: 'huele raro',
        done: 'Cinco visitas, cinco lecciones. Ya sabés cuidar una puerta.',
        fact:
          'Cada colmena tiene su propio perfume y viene sobre todo de la reina. Las guardianas huelen a cada una que llega. La más despeinada entra sin problema si huele a casa.',
        arrivals: [
          {
            name: 'Vuelve polvorienta y despeinada, huele a casa',
            enter: true,
            meli: 'Bien. Es una de nosotras. Vuelve hecha un desastre porque trabajó todo el día.',
          },
          {
            name: 'Impecable y prolija, huele a otra colmena',
            enter: false,
            meli: 'Ojo con esa. Está limpita, pero no es de acá. El aspecto no dice nada.',
          },
          {
            name: 'Cargada de polen hasta las patas, huele a casa',
            enter: true,
            meli: 'Esa vuelve con las canastas llenas. Abrile la puerta, que pesa.',
          },
          {
            name: 'Una avispa, va derecho a la entrada',
            enter: false,
            meli: 'Esa no viene a ayudar. Viene por la miel. Entre todas la sacamos.',
          },
          {
            name: 'Perdida, huele raro, pero trae néctar',
            enter: true,
            meli: 'A esta la dejamos pasar. Si trae néctar, la puerta se abre igual. Somos más estrictas con las manos vacías.',
          },
        ],
      },
    },
    endTitle: 'Acá termina lo que puedo contarte volando',
    endText:
      'El resto del viaje de Luna está en el libro: las larvas, las guardianas, la vuelta al jardín cuando cae el sol.',
    endBookTitle: 'El libro',
    endBookText:
      'Escrito e ilustrado por Catalina Marzorati, la misma que plantó los primeros pistachos de esta chacra. Estamos preparando la edición.',
    endBookCta: 'Quiero saber cuándo sale',
    endSchoolTitle: 'Para escuelas',
    endSchoolText:
      'El cuento nació para explicarles a los chicos cómo viven las abejas. Tenemos ideas para trabajarlo en clase.',
    endSchoolCta: 'Escribinos por tu grupo',
    endWorkshopTitle: 'El taller',
    endWorkshopText:
      'Lo que Luna vive en el cuento se puede vivir de verdad: abrimos una colmena y probamos miel del panal.',
    endWorkshopCta: 'Ver el taller de abejas',
    backHome: 'Volver a la chacra',
    rights:
      'Texto e ilustraciones: Catalina Marzorati. Todos los derechos reservados. Muestra de lectura.',
  },

  en: {
    eyebrow: 'A story by Catalina Marzorati',
    title: 'Luna y el secreto de la colmena',
    subtitle: 'A journey through the world of bees',
    author: 'Catalina Marzorati',
    intro:
      'Luna sits down in the garden, hears a buzz, and ends up the size of a bee. I went with her on that journey. Now it is your turn: come down with me to the heart of the hive. The story pages are in Spanish, the way Catalina wrote them.',
    excerpto: 'This is a preview of the full book.',
    start: 'Begin the journey',
    pageOf: 'Page',
    read: 'Let Meli read',
    readStop: 'Stop',
    readAgain: 'Again',
    voiceLabel: 'Choose a voice',
    voiceHint: 'Try another voice if this one sounds too robotic.',
    autoLabel: 'Keep going on its own',
    cardHint: 'Look for the lights in the picture',
    cardKicker: 'Did you know...?',
    cardClose: 'Close',
    chacraLabel: 'On the farm',
    zoomLabel: 'Look closer',
    zoomHint: 'Drag to explore the page',
    moreInBook: 'And the book goes on',
    found: 'Already found',
    playHint: 'Tap to play',
    againLabel: 'Again',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    depthLabel: 'Depth',
    carnetTitle: 'Your bee notebook',
    carnetLead: 'Everything you uncovered along the way.',
    carnetEmpty: 'Still empty. Tap the lights in the picture and play with Meli.',
    carnetOpen: 'See my notebook',
    carnetClose: 'Keep reading',
    carnetCount: '{a} of {b}',
    carnetSaberes: 'Secrets found',
    carnetPruebas: 'Challenges passed',
    promesaJuegos: 'things to do',
    promesaCartas: 'hidden secrets',
    juegos: {
      ojos: {
        logro: 'Saw the garden through bee eyes',
        title: 'Meli’s eyes',
        hint: 'Tap the eye and see the same garden the way I see it.',
        button: 'Look with my eyes',
        active: 'Back to your eyes',
        meli: 'I cannot see red. But I see ultraviolet: every flower paints me a landing strip.',
        fact:
          'True: bees see ultraviolet and cannot see red. Many flowers carry patterns that only show up under that light, and all of them point at the nectar.',
        compareHint: 'The same flower, seen two ways.',
        eyesYou: 'with your eyes',
        eyesMe: 'with mine',
      },
      zumbido: {
        logro: 'Measured your buzz against mine',
        title: 'Where does the Bzzz come from?',
        hint: 'Not from the mouth. Tap the flower as fast as you can for five seconds.',
        button: 'Start flapping',
        go: 'Faster, faster, faster!',
        you: 'you',
        me: 'Meli',
        unit: 'per second',
        result: 'You flapped {n} times per second.',
        fact:
          'My wings beat two hundred and thirty times a second. So fast that the air itself sounds: that is the buzz.',
        sound: 'buzz',
      },
      plato: {
        logro: 'Emptied the plate without bees',
        title: 'The plate without bees',
        hint: 'Take off the table whatever would vanish if we were not around.',
        stays: 'stays',
        goes: 'vanishes',
        done: 'Out of {t}, {q} stayed.',
        fact:
          'One in every three spoonfuls you eat exists because something pollinated that plant. Almost always, something with wings.',
        items: [
          {
            name: 'apple',
            poliniza: true,
            meli: 'Without us, not a single apple. Every blossom needs several visits.',
          },
          {
            name: 'almond',
            poliniza: true,
            meli: 'The almond depends on us almost one hundred percent. No bees, no almonds.',
          },
          {
            name: 'pumpkin',
            poliniza: true,
            meli: 'Pumpkins have male and female flowers. Someone has to carry the pollen across.',
          },
          {
            name: 'blueberry',
            poliniza: true,
            meli: 'This one has to be shaken to release its pollen. We do it by buzzing.',
          },
          {
            name: 'coffee',
            poliniza: true,
            meli: 'There would still be coffee, but far less and much smaller. Half of it goes.',
          },
          {
            name: 'wheat bread',
            poliniza: false,
            meli: 'That one stays: wheat is pollinated by the wind, we never even visit it.',
          },
          {
            name: 'rice',
            poliniza: false,
            meli: 'Rice manages with the wind too. It stays on the plate.',
          },
          {
            name: 'milk',
            poliniza: false,
            meli: 'Milk stays... although the cow eats alfalfa, and alfalfa is pollinated by us.',
          },
        ],
      },
      transformacion: {
        logro: 'Built a whole bee body',
        title: 'Build your bee body',
        hint: 'Press and hold. The pollen light will do the rest.',
        holdCta: 'Press and hold',
        more: 'Something is still missing, shall we go on?',
        done: 'Now you are a bee.',
        count: 'Five eyes, four wings, two antennae, six legs.',
        parts: [
          {
            name: '4 wings',
            meli: 'Four, not two. They hook together in pairs to fly stronger.',
          },
          {
            name: '5 eyes',
            meli: 'Two big ones and three tiny ones on top. With those I find the sun even on a cloudy day.',
          },
          {
            name: '2 antennae',
            meli: 'With these I smell the world. I know a flower before I see it.',
          },
          {
            name: '6 legs with baskets',
            meli: 'The back ones carry the pollen. They are like two little baskets.',
          },
        ],
      },
      colmena: {
        logro: 'Guessed how many live in the little box',
        title: 'How many live in there?',
        hint: 'Slide and take a guess. Then we open the box.',
        button: 'Open the box',
        guess: 'I say',
        low: 'Many more than that. Keep going up.',
        high: 'Oh no, that many would never fit.',
        close: 'Very close!',
        fact:
          'In summer about sixty thousand of us live in a single box, and nearly all of us are sisters. One queen, a few drones, and the rest workers.',
        unit: 'bees',
      },
      larvas: {
        logro: 'Found out what makes a queen',
        title: 'What you eat decides who you are',
        hint: 'Pick a food and give it to a larva. Watch what happens.',
        jalea: 'royal jelly',
        pan: 'bee bread',
        pick: 'Now tap a larva',
        step1: 'Pick the food',
        step2: 'Tap a larva',
        again: 'Empty the frame',
        reina: 'queen',
        obrera: 'worker',
        larva: 'Larva',
        larvaReal: 'Larva in a queen cell',
        msgReina: 'That one will be a queen. Once grown she lays two thousand eggs a day.',
        msgObrera:
          'That one becomes a worker: she will clean, nurse larvae, build wax and only fly out at the very end.',
        msgCeldaPan:
          'Look at that: the cell was a queen cell, but on bee bread out comes a worker anyway. The plate decides, not the cradle.',
        dosReinas:
          'Oh dear! Now we have two queens and nobody gathering nectar. The food decides who you are, not the egg.',
        done: 'They all started out the same. The only difference was the plate.',
        fact:
          'Every larva gets royal jelly for the first three days. Keep feeding it and she becomes a queen; switch to bee bread and she becomes a worker. The egg is identical.',
      },
      baile: {
        logro: 'Danced the waggle like a real forager',
        title: 'Dance the waggle yourself',
        hint: 'Drag to point at the flower and choose how far it is. The sun is always up top.',
        angle: 'Towards',
        distance: 'How far',
        near: 'close by',
        far: 'very far',
        send: 'Send the workers',
        dancing: 'Meli is dancing...',
        win: 'They found the flower!',
        miss: 'They went the wrong way. Nudge it a little and try again.',
        fact:
          'The bee dances the angle between the sun and the flower, and the longer the waggle, the further away it is. It is the only symbolic language known outside humans.',
        sun: 'sun',
        outside: 'outside',
        inside: 'inside, in the dark',
      },
      guardianas: {
        logro: 'Guarded the door of the hive',
        title: 'You are the guard',
        hint: 'Five want to come in. Do not look at what they look like: smell them.',
        yes: 'Let her in',
        no: 'Turn away',
        smellHome: 'smells like home',
        smellStrange: 'smells wrong',
        done: 'Five visitors, five lessons. Now you know how to keep a door.',
        fact:
          'Every hive has its own perfume and it comes mostly from the queen. The guards smell everyone who arrives. The scruffiest bee gets in without trouble if she smells like home.',
        arrivals: [
          {
            name: 'Dusty and scruffy, smells like home',
            enter: true,
            meli: 'Good. She is one of us. She comes home a mess because she worked all day.',
          },
          {
            name: 'Spotless and tidy, smells of another hive',
            enter: false,
            meli: 'Careful with that one. She is neat, but she is not from here. Looks say nothing.',
          },
          {
            name: 'Loaded with pollen to the knees, smells like home',
            enter: true,
            meli: 'That one is coming back with full baskets. Open up, she is heavy.',
          },
          {
            name: 'A wasp, heading straight for the door',
            enter: false,
            meli: 'She is not here to help. She is here for the honey. Together we push her out.',
          },
          {
            name: 'Lost, smells wrong, but carries nectar',
            enter: true,
            meli: 'This one we let through. Bring nectar and the door opens anyway. We are stricter with empty hands.',
          },
        ],
      },
    },
    endTitle: 'This is where my flying tale stops',
    endText:
      'The rest of Luna’s journey lives in the book: the larvae, the guards, the way back to the garden as the sun goes down.',
    endBookTitle: 'The book',
    endBookText:
      'Written and illustrated by Catalina Marzorati, the same person who planted the first pistachio trees on this farm. The edition is in preparation.',
    endBookCta: 'Tell me when it is out',
    endSchoolTitle: 'For schools',
    endSchoolText:
      'The story was written to explain to children how bees live. We have ideas for working with it in class.',
    endSchoolCta: 'Write to us about your group',
    endWorkshopTitle: 'The workshop',
    endWorkshopText:
      'What Luna lives in the story can be lived for real: we open a hive and taste honey from the comb.',
    endWorkshopCta: 'See the bee workshop',
    backHome: 'Back to the farm',
    rights:
      'Text and illustrations: Catalina Marzorati. All rights reserved. Reading sample.',
  },
};

/** Nur die Seiten, die in der Leseprobe gezeigt werden (siehe `activo`). */
export const activePages = pages.filter((p) => p.activo !== false);

/** Wie viele Wissenskarten es insgesamt gibt — für das Sammelheft. */
export const totalCards = activePages.reduce((n, p) => n + p.cards.length, 0);
/** Wie viele Spiele es gibt — für das Sammelheft. */
export const totalJuegos = activePages.filter((p) => p.juego).length;
