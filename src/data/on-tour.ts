import type { Lang } from '../i18n';
import type { WorkshopCurrency } from './workshops';

/**
 * "On Tour" — die Chacra kommt zu dir.
 *
 * ---------------------------------------------------------------------
 * Warum diese Datei aussieht wie modulos.ts
 * ---------------------------------------------------------------------
 * Derselbe Weg wie bei den Talleres und den Módulos:
 *
 *     supabase: Tabelle + View `*_public`
 *         └─> src/lib/fetch-*.ts liest zur Bauzeit
 *               └─> Komponente rendert
 *     src/data/*.ts = Typen + Rückfalldaten, wenn kein Backend da ist
 *
 * Struktur und Feldnamen sind deshalb schon so geschnitten, wie die
 * Tabellen aussehen werden: sprachneutrale Technik oben, alle Texte in
 * `text: Record<Lang, …>`.
 *
 * ---------------------------------------------------------------------
 * Warum es ZWEI Tabellen sind und nicht eine
 * ---------------------------------------------------------------------
 * Ein Seminar und eine Anfahrtszone haben nichts gemeinsam außer, dass
 * beide in den Preis eingehen. Die Zonen ändern sich unabhängig von den
 * Seminaren (Spritpreis, neue Orte) und sollen einzeln pflegbar sein,
 * ohne dass man ein Seminar aufmacht. Steckte die Zonenliste in jedem
 * Seminar, müsste man sie dreimal pflegen und sie liefe dreimal
 * auseinander.
 *
 * ENTWURF: Die drei Seminare — Namen, Beschreibungen, Preise, Dauer und
 * Mindestteilnehmerzahl — sind Vorschläge und müssen bestätigt oder
 * ersetzt werden. Die drei Zonen stammen dagegen aus dem Wunschdokument
 * und sind belastbar.
 */

/**
 * Wie der Preis zu lesen ist.
 *  - `porPersona`: Betrag je Teilnehmerin, ab `minPersonas`.
 *  - `total`: Pauschale für die ganze Gruppe, unabhängig von der Anzahl.
 *
 * Das muss auf der Website unmissverständlich dastehen. „US$ 40" heißt
 * bei einem Seminar pro Kopf und beim nächsten für alle zusammen — wer
 * das verwechselt, verwechselt es um den Faktor zwanzig.
 */
export type PrecioTipo = 'porPersona' | 'total';

export interface SeminarioTexto {
  title: string;
  /** Ein bis zwei Sätze auf der Karte. */
  summary: string;
  /** Der lange Text hinter "Leer más". */
  longDesc: string;
  /** Was mitgebracht wird — das entscheidet oft die Buchung. */
  incluye: string[];
  /** Was der Ort stellen muss. Vermeidet die häufigste Rückfrage. */
  necesitamos: string;
}

export interface Seminario {
  /** Stabiler Schlüssel, zugleich Wert im Anfrageformular. */
  id: string;
  /** Reihenfolge auf der Seite. */
  numero: number;
  /** Pigment aus tokens.css — bindet das Seminar an sein Thema. */
  pigmento: 'miel' | 'barro' | 'lavanda';
  precio: number;
  precioTipo: PrecioTipo;
  currency: WorkshopCurrency;
  /** Dauer in Minuten, wie bei den Módulos — damit sich Summen rechnen. */
  duracion: number;
  minPersonas: number;
  maxPersonas: number;
  activo: boolean;
  text: Record<Lang, SeminarioTexto>;
}

/**
 * Anfahrtszone.
 *
 * `aPedido` ist kein Preis von null, sondern das Gegenteil: der Aufschlag
 * steht noch nicht fest und wird von Hand genannt. Ohne dieses Feld
 * müsste "Rest des Landes" als 0 eingetragen werden, und das Formular
 * würde einen Preis versprechen, den niemand halten kann.
 */
export interface Zona {
  id: string;
  recargo: number;
  currency: WorkshopCurrency;
  aPedido: boolean;
  orden: number;
  nombre: Record<Lang, string>;
  /** Welche Orte dazugehören — beantwortet "bin ich da drin?". */
  detalle: Record<Lang, string>;
}

export const seminarios: Seminario[] = [
  {
    id: 'colmena-viajera',
    numero: 1,
    pigmento: 'miel',
    precio: 45,
    precioTipo: 'porPersona',
    currency: 'USD',
    duracion: 120,
    minPersonas: 8,
    maxPersonas: 25,
    activo: true,
    text: {
      es: {
        title: 'La colmena viajera',
        summary:
          'Llevamos un panal de verdad, el traje y la miel recién sacada. Dos horas con las abejas adelante, en tu patio o tu salón.',
        longDesc:
          'Traemos un cuadro de colmena en una caja con vidrio — se ve todo y no sale ninguna abeja —, el traje completo para quien se anime a probárselo, y miel sin filtrar directamente del panal. Contamos cómo se organiza una colmena, por qué deciden mejor en grupo que solas, y qué de lo que hay sobre una mesa existe gracias a ellas. Termina con una cata de tres mieles distintas de la misma chacra: la diferencia entre ellas es la flor, y se nota.',
        incluye: [
          'Cuadro de colmena en caja vidriada',
          'Traje de apicultor para probarse',
          'Cata de tres mieles de la chacra',
          'Todo el material y la coordinación',
        ],
        necesitamos: 'Una mesa grande y, si es posible, sombra. Nada más.',
      },
      en: {
        title: 'The travelling hive',
        summary:
          'We bring a real comb, the suit and honey straight from the frame. Two hours with the bees in front of you, in your yard or your room.',
        longDesc:
          'We bring a hive frame in a glass-fronted box — everything is visible and no bee gets out —, the full suit for whoever wants to try it on, and unfiltered honey straight from the comb. We explain how a hive organises itself, why they decide better together than alone, and how much of what sits on a table exists thanks to them. It ends with a tasting of three different honeys from the same farm: what separates them is the flower, and you can taste it.',
        incluye: [
          'Hive frame in a glass-fronted box',
          'Beekeeper suit to try on',
          'Tasting of three honeys from the farm',
          'All materials and coordination',
        ],
        necesitamos: 'A large table and, if possible, some shade. Nothing else.',
      },
    },
  },
  {
    id: 'barro-y-manos',
    numero: 2,
    pigmento: 'barro',
    precio: 38,
    precioTipo: 'porPersona',
    currency: 'USD',
    duracion: 180,
    minPersonas: 6,
    maxPersonas: 18,
    activo: true,
    text: {
      es: {
        title: 'Barro y manos',
        summary:
          'Tierra, arena y paja. Se amasa con los pies, se levanta con las manos y cada quien se lleva lo que hizo.',
        longDesc:
          'Las casas de la chacra están hechas con la tierra del propio terreno. Traemos esa misma mezcla y la prueba que decide si un barro sirve o no — la del frasco, que separa arena, limo y arcilla en tres capas y no miente. Después se amasa (con los pies, es más rápido y más divertido) y cada persona construye algo pequeño: un ladrillo, una maceta, un revoque sobre un bastidor. Se seca en unos días y queda.',
        incluye: [
          'Tierra, arena y paja de la chacra',
          'La prueba del frasco para leer un suelo',
          'Herramienta y bastidores',
          'Lo que cada quien hizo, para llevarse',
        ],
        necesitamos: 'Un espacio exterior con canilla de agua cerca.',
      },
      en: {
        title: 'Mud and hands',
        summary:
          'Earth, sand and straw. You knead it with your feet, raise it with your hands, and everyone takes home what they made.',
        longDesc:
          'The houses on the farm are built from the earth of the land itself. We bring that same mixture and the test that decides whether a clay is any good — the jar test, which separates sand, silt and clay into three layers and never lies. Then comes the kneading (with your feet, it is faster and more fun) and each person builds something small: a brick, a pot, a render on a frame. It dries in a few days and it lasts.',
        incluye: [
          'Earth, sand and straw from the farm',
          'The jar test for reading a soil',
          'Tools and frames',
          'Whatever each person made, to take home',
        ],
        necesitamos: 'An outdoor space with a water tap nearby.',
      },
    },
  },
  {
    id: 'aromas',
    numero: 3,
    pigmento: 'lavanda',
    precio: 1600,
    precioTipo: 'total',
    currency: 'UYU',
    duracion: 150,
    minPersonas: 6,
    maxPersonas: 20,
    activo: true,
    text: {
      es: {
        title: 'Aromas de la chacra',
        summary:
          'Un alambique chico, lavanda recién cortada y el olor llenando la sala. Cada quien se va con su jabón y su vela.',
        longDesc:
          'Montamos el alambique y destilamos lavanda ahí mismo: el vapor pasa por las flores, arrastra el aceite y este queda flotando sobre el agua, donde se separa. De ese único paso salen dos cosas — el aceite esencial y el hidrolato —, y de ahí se abre en dos caminos: jabón por un lado, vela por el otro. La cera de las velas es de nuestras propias colmenas, de las mismas abejas que visitan esa lavanda. Cada persona se lleva un jabón y una vela hechos en el taller.',
        incluye: [
          'Alambique y destilación en vivo',
          'Lavanda de la chacra, recién cortada',
          'Cera de nuestras colmenas',
          'Un jabón y una vela por persona',
        ],
        necesitamos:
          'Una mesa larga, un enchufe y una ventana que se pueda abrir.',
      },
      en: {
        title: 'Scents from the farm',
        summary:
          'A small still, freshly cut lavender and the smell filling the room. Everyone leaves with their own soap and candle.',
        longDesc:
          'We set up the still and distil lavender right there: steam passes through the flowers, carries the oil with it, and the oil ends up floating on the water, where it separates. That single step yields two things — the essential oil and the hydrosol — and from there the path opens into two: soap on one side, candle on the other. The wax for the candles comes from our own hives, from the very bees that visit that lavender. Each person takes home a soap and a candle made during the session.',
        incluye: [
          'Still and live distillation',
          'Lavender from the farm, freshly cut',
          'Beeswax from our own hives',
          'One soap and one candle per person',
        ],
        necesitamos: 'A long table, a power socket and a window that opens.',
      },
    },
  },
];

/**
 * Die Anfahrtszonen. Stammen aus dem Wunschdokument, im Gegensatz zu den
 * Seminaren also keine Erfindung.
 *
 * Sie sind bewusst nach `orden` sortiert und nicht nach Preis: die Liste
 * liest sich als Ringe von der Chacra nach außen, und so sucht auch
 * jemand, der wissen will, ob sein Ort dabei ist.
 */
export const zonas: Zona[] = [
  {
    id: 'cerca',
    recargo: 0,
    currency: 'UYU',
    aPedido: false,
    orden: 1,
    nombre: { es: 'Sin recargo', en: 'No travel fee' },
    detalle: {
      es: 'Maldonado, San Carlos y Punta Ballena.',
      en: 'Maldonado, San Carlos and Punta Ballena.',
    },
  },
  {
    id: 'costa',
    recargo: 1200,
    currency: 'UYU',
    aPedido: false,
    orden: 2,
    nombre: { es: 'Costa cercana', en: 'Nearby coast' },
    detalle: {
      es: 'Desde Punta del Este hasta San Ignacio, y Piriápolis.',
      en: 'From Punta del Este to San Ignacio, and Piriápolis.',
    },
  },
  {
    id: 'resto',
    recargo: 0,
    currency: 'UYU',
    aPedido: true,
    orden: 3,
    nombre: { es: 'Resto del país', en: 'Rest of the country' },
    detalle: {
      es: 'Lo calculamos por distancia y te lo decimos en la propuesta.',
      en: 'We work it out by distance and tell you in the proposal.',
    },
  },
];

/** UI-Texte des Bereichs. Gehören zu diesem Datensatz, nicht in src/i18n. */
export interface OnTourUI {
  kicker: string;
  title: string;
  intro: string;
  /* Karte */
  leerMas: string;
  cerrar: string;
  incluye: string;
  necesitamos: string;
  duracion: string;
  minutos: string;
  horas: string;
  personas: string;
  desde: string;
  hasta: string;
  porPersona: string;
  precioTotal: string;
  elegir: string;
  /* Zonen */
  zonasTitulo: string;
  zonasIntro: string;
  zonaSinRecargo: string;
  zonaAPedido: string;
  /* Anfrage */
  seleccionados: string;
  ninguno: string;
  pedir: string;
  campoZona: string;
  campoLugar: string;
  campoPersonas: string;
  campoOrganizacion: string;
  estimacion: string;
  estimacionNota: string;
  noVinculante: string;

  /* ------------------------------------------------------------------
   * Ergänzt beim Bau des Bereichs (D7).
   * ------------------------------------------------------------------
   * Der Entwurf oben beschreibt die Karten und die Zonen vollständig,
   * nicht aber den Anfragedialog. Der ist dreistufig wie bei „Las abejas
   * educan" und braucht dieselben Beschriftungen: Schrittnamen,
   * Kontaktfelder, Einwilligung, Wartezustand, Fehlerfälle, Dank.
   *
   * Sie stehen hier und nicht in src/i18n, weil sie zu DIESEM Datensatz
   * gehören: wer die Seminare pflegt, pflegt auch die Sätze darum herum.
   */
  formTitle: string;
  formIntro: string;
  pasoSeminarios: string;
  pasoLugar: string;
  pasoContacto: string;
  campoFecha1: string;
  campoFecha2: string;
  campoNombre: string;
  campoMail: string;
  campoTel: string;
  campoNota: string;
  consentimiento: string;
  privacidad: string;
  enviar: string;
  enviando: string;
  volver: string;
  siguiente: string;
  gracias: string;
  graciasTexto: string;
  errorConexion: string;
  errorEnvio: string;
  /** Zeile der Schätzung, die die Seminare zusammenfasst. */
  estimacionSeminarios: string;
  /** Zeile der Schätzung für die Anfahrt. */
  estimacionTraslado: string;
  /** Statt einer Zahl, wenn die Zone `aPedido` ist. */
  estimacionAPedido: string;
  /** Summenzeile. */
  estimacionTotal: string;
  /** „mindestens" — vor der Zahl in der Warnung zur Gruppengröße. */
  minimo: string;
  /** Kopf der freundlichen Warnung, wenn die Gruppe zu klein ist. */
  avisoMinimo: string;
  /** Zustand des Auswahlknopfs, wenn das Seminar gewählt ist. */
  elegido: string;
}

export const onTourUI: Record<Lang, OnTourUI> = {
  es: {
    kicker: 'La chacra sale de gira',
    title: 'On Tour',
    intro:
      'No siempre se puede venir hasta acá. Entonces vamos nosotros: llevamos las colmenas, el barro o el alambique a tu evento, tu empresa o tu escuela, con todo el material y sin que tengas que preparar nada.',
    leerMas: 'Leer más',
    cerrar: 'Cerrar',
    incluye: 'Qué llevamos',
    necesitamos: 'Qué necesitamos del lugar',
    duracion: 'Duración',
    minutos: 'minutos',
    horas: 'horas',
    personas: 'personas',
    desde: 'desde',
    hasta: 'hasta',
    porPersona: 'por persona',
    precioTotal: 'por el grupo entero',
    elegir: 'Elegir seminario',
    zonasTitulo: 'Cuánto cuesta que vayamos',
    zonasIntro:
      'El traslado se suma una sola vez, no por persona. Si tu lugar no está en la lista, igual escribinos.',
    zonaSinRecargo: 'Incluido',
    zonaAPedido: 'A calcular',
    seleccionados: 'seminarios elegidos',
    ninguno: 'Todavía no elegiste ningún seminario',
    pedir: 'Pedir presupuesto',
    campoZona: '¿Dónde sería?',
    campoLugar: 'Localidad y dirección aproximada',
    campoPersonas: 'Cuántas personas',
    campoOrganizacion: 'Empresa, escuela u organización',
    estimacion: 'Estimación',
    estimacionNota:
      'Es una cuenta orientativa con los datos que pusiste. El precio final va en la propuesta.',
    noVinculante: 'Esto es una consulta, no una reserva. No te compromete a nada.',
    formTitle: 'Pedir presupuesto',
    formIntro:
      'Contanos dónde sería y cuántos son. Te mandamos una propuesta con fecha y precio cerrado.',
    pasoSeminarios: 'Qué seminario',
    pasoLugar: 'Dónde y cuándo',
    pasoContacto: 'Quién pregunta',
    campoFecha1: 'Primera fecha deseada',
    campoFecha2: 'Segunda fecha (por si la primera no se puede)',
    campoNombre: 'Tu nombre',
    campoMail: 'Correo',
    campoTel: 'Teléfono',
    campoNota: '¿Algo más que debamos saber?',
    consentimiento:
      'Acepto que Retoños del Edén guarde estos datos para responder a esta consulta y coordinar la salida.',
    privacidad: 'Cómo cuidamos tus datos',
    enviar: 'Enviar solicitud',
    enviando: 'Enviando…',
    volver: 'Volver',
    siguiente: 'Siguiente',
    gracias: '¡Gracias!',
    graciasTexto:
      'Recibimos tu consulta. Te escribimos dentro de los próximos días con una propuesta y las fechas posibles.',
    errorConexion:
      'No pudimos enviar la consulta: parece que no hay conexión. Tus datos siguen acá, probá de nuevo en un momento o escribinos a los contactos de más abajo.',
    errorEnvio:
      'Algo salió mal al guardar la consulta. Tus datos siguen acá: probá de nuevo, y si vuelve a fallar escribinos a los contactos de más abajo.',
    estimacionSeminarios: 'Seminarios',
    estimacionTraslado: 'Traslado',
    estimacionAPedido: 'Lo calculamos y te lo decimos en la propuesta',
    estimacionTotal: 'Aproximado',
    minimo: 'mínimo',
    avisoMinimo: 'Con ese número quedarían por debajo del grupo mínimo:',
    elegido: 'Elegido',
  },
  en: {
    kicker: 'The farm goes on tour',
    title: 'On Tour',
    intro:
      'You cannot always come out here. So we come to you: we bring the hives, the mud or the still to your event, your company or your school, with all the materials and nothing for you to prepare.',
    leerMas: 'Read more',
    cerrar: 'Close',
    incluye: 'What we bring',
    necesitamos: 'What we need from the venue',
    duracion: 'Length',
    minutos: 'minutes',
    horas: 'hours',
    personas: 'people',
    desde: 'from',
    hasta: 'up to',
    porPersona: 'per person',
    precioTotal: 'for the whole group',
    elegir: 'Choose session',
    zonasTitulo: 'What it costs for us to come',
    zonasIntro:
      'Travel is added once, not per person. If your place is not on the list, write to us anyway.',
    zonaSinRecargo: 'Included',
    zonaAPedido: 'To be worked out',
    seleccionados: 'sessions chosen',
    ninguno: 'You have not chosen a session yet',
    pedir: 'Ask for a quote',
    campoZona: 'Where would it be?',
    campoLugar: 'Town and rough address',
    campoPersonas: 'How many people',
    campoOrganizacion: 'Company, school or organisation',
    estimacion: 'Estimate',
    estimacionNota:
      'A rough sum from what you entered. The final price goes in the proposal.',
    noVinculante: 'This is an enquiry, not a booking. It commits you to nothing.',
    formTitle: 'Ask for a quote',
    formIntro:
      'Tell us where it would be and how many of you there are. We will send a proposal with a date and a firm price.',
    pasoSeminarios: 'Which session',
    pasoLugar: 'Where and when',
    pasoContacto: 'Who is asking',
    campoFecha1: 'Preferred date',
    campoFecha2: 'Second date (in case the first does not work)',
    campoNombre: 'Your name',
    campoMail: 'Email',
    campoTel: 'Phone',
    campoNota: 'Anything else we should know?',
    consentimiento:
      'I agree that Retoños del Edén may store these details in order to answer this enquiry and arrange the visit.',
    privacidad: 'How we look after your data',
    enviar: 'Send enquiry',
    enviando: 'Sending…',
    volver: 'Back',
    siguiente: 'Next',
    gracias: 'Thank you!',
    graciasTexto:
      'We have your enquiry. We will write within the next few days with a proposal and possible dates.',
    errorConexion:
      'We could not send the enquiry: there seems to be no connection. Your details are still here — try again in a moment, or write to us using the contact details further down.',
    errorEnvio:
      'Something went wrong while saving the enquiry. Your details are still here: please try again, and if it fails once more use the contact details further down.',
    estimacionSeminarios: 'Sessions',
    estimacionTraslado: 'Travel',
    estimacionAPedido: 'We work it out and tell you in the proposal',
    estimacionTotal: 'Roughly',
    minimo: 'minimum',
    avisoMinimo: 'With that number you would be below the minimum group size:',
    elegido: 'Chosen',
  },
};
