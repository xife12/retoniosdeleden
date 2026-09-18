import type { Lang } from '../i18n';

/**
 * "Las abejas educan" — die Schulmodule.
 *
 * ---------------------------------------------------------------------
 * Warum diese Datei aussieht wie workshops.ts
 * ---------------------------------------------------------------------
 * Die Module sollen im Backend (/admin) pflegbar werden, genau wie die
 * Talleres. Der Weg dorthin ist bei den Talleres schon vorgezeichnet:
 *
 *     supabase: Tabelle + View `*_public`
 *         └─> src/lib/fetch-*.ts liest zur Bauzeit
 *               └─> Komponente rendert
 *     src/data/*.ts = Typen + Rückfalldaten, wenn kein Backend da ist
 *
 * Diese Datei ist bewusst der letzte Schritt dieses Weges: Struktur und
 * Feldnamen sind schon so geschnitten, wie die Tabelle aussieht
 * (sprachneutrale Technik oben, alle Texte in `text: Record<Lang, …>`).
 *
 * STAND: Die Datenbankseite steht (Aufgabe D3).
 *   - supabase/migrations/006_modulos.sql — Tabelle `modulos`, öffentliche
 *     View `modulos_public`, Entwurf/Veröffentlicht wie bei den Talleres.
 *   - src/lib/fetch-modulos.ts — liest zur Bauzeit aus dieser View.
 *   - /admin → Módulos — Liste und Editor.
 *
 * Damit ist diese Datei ab jetzt das, was workshops.ts auch ist: Typen und
 * RÜCKFALLDATEN. `fetchModulos()` nimmt sie, wenn die Migration noch nicht
 * eingespielt ist, keine Zugangsdaten gesetzt sind oder noch nichts
 * veröffentlicht wurde — der Build bleibt dadurch nie stehen. Sobald die
 * Module in der Datenbank veröffentlicht sind, gewinnt immer die Datenbank.
 * Wer hier etwas ändert, ändert also nur noch den Notnagel; gepflegt wird
 * im Backend.
 *
 * ENTWURF: Inhalte, Altersspannen, Dauer und Lernziele sind Vorschläge
 * und müssen von Catalina bestätigt oder ersetzt werden.
 */

/** Wo das Modul stattfindet. Trennt die beiden Abschnitte der "Ruta". */
export type ModuloLugar = 'aula' | 'chacra';

/**
 * Buchbarkeit.
 *  - `disponible`: kann angefragt werden.
 *  - `proximamente`: wird es geben, aber noch nicht. Die Karte wird
 *    gezeigt (sie ist das Ziel des Weges), aber nicht auswählbar.
 */
export type ModuloEstado = 'disponible' | 'proximamente';

/** Monate als Zahl 1–12. Je Modul verschieden: das Schuljahr und die
    Bienensaison decken sich nicht. */
export type Mes = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface ModuloTexto {
  title: string;
  /** Ein bis zwei Sätze auf der Karte. */
  summary: string;
  /** Der lange Text hinter "Leer más". */
  longDesc: string;
  /** Ein bis drei Lernziele. */
  objetivos: string[];
  /** Wie die Altersangabe geschrieben steht, z. B. "3.° a 6.°". */
  clase: string;
}

export interface Modulo {
  /** Stabiler Schlüssel, auch der Wert im Anfrageformular. */
  id: string;
  /** Reihenfolge auf dem Weg. Die Nummer steht sichtbar in der Wabe. */
  numero: number;
  lugar: ModuloLugar;
  estado: ModuloEstado;
  edadMin: number;
  /** Offen nach oben, wenn nicht gesetzt ("ab 8"). */
  edadMax?: number;
  /** Dauer in Minuten — als Zahl, damit sich Summen rechnen lassen. */
  duracion: number;
  maxAlumnos: number;
  meses: Mes[];
  text: Record<Lang, ModuloTexto>;
}

export const modulos: Modulo[] = [
  {
    id: 'ojos',
    numero: 1,
    lugar: 'aula',
    estado: 'disponible',
    edadMin: 6,
    edadMax: 9,
    duracion: 60,
    maxAlumnos: 30,
    meses: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    text: {
      es: {
        title: 'El mundo con ojos de abeja',
        clase: '1.° a 3.°',
        summary:
          'Una abeja ve colores que nosotros no vemos y se habla con olores. Nos ponemos en su lugar y miramos el aula desde ahí.',
        longDesc:
          'Empezamos por lo más sencillo y lo más raro a la vez: una abeja no ve el mundo como nosotros. Distingue colores que para nosotros no existen, encuentra una flor por el olor antes que por la forma y siente el movimiento del aire con los pelitos del cuerpo. Con lentes de cartón, flores de papel y unos pocos experimentos, la clase entera pasa una hora viendo, oliendo y tocando como si fuera una abeja. Al final volvemos a mirar el patio de la escuela y ya no se ve igual.',
        objetivos: [
          'Observar con atención y describir lo que se observa.',
          'Entender que la percepción no termina en la nuestra.',
        ],
      },
      en: {
        title: 'The world through a bee’s eyes',
        clase: 'Years 1–3',
        summary:
          'A bee sees colours we cannot see and talks in scent. We step into her place and look at the classroom from there.',
        longDesc:
          'We start with the simplest and strangest thing at once: a bee does not see the world the way we do. She tells apart colours that do not exist for us, finds a flower by smell before shape, and feels the movement of air through the hairs on her body. With cardboard lenses, paper flowers and a handful of experiments, the whole class spends an hour seeing, smelling and touching like a bee. At the end we look at the school yard again, and it no longer looks the same.',
        objetivos: [
          'Observe closely and describe what is observed.',
          'Understand that perception does not end with our own.',
        ],
      },
    },
  },
  {
    id: 'equipo',
    numero: 2,
    lugar: 'aula',
    estado: 'disponible',
    edadMin: 8,
    edadMax: 12,
    duracion: 90,
    maxAlumnos: 30,
    meses: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    text: {
      es: {
        title: 'La colmena es un equipo',
        clase: '3.° a 6.°',
        summary:
          'Miles de abejas y ninguna jefa. Descubrimos cómo se reparten el trabajo, cómo se avisan dónde hay flores y por qué deciden mejor en grupo.',
        longDesc:
          'En una colmena hay cincuenta mil habitantes y nadie da órdenes. Cada abeja cambia de tarea a lo largo de su vida — limpia, cuida crías, construye, cuida la puerta, sale a volar — y el conjunto funciona sin que nadie lo organice desde arriba. Vemos cómo se avisan dónde hay flores con un baile que indica distancia y dirección, y hacemos el mismo baile en el aula. Después le damos vuelta la pregunta: ¿en qué se parece esta clase a una colmena, y en qué no?',
        objetivos: [
          'Reconocer una organización que funciona sin jefes.',
          'Describir cómo se transmite información dentro de un grupo.',
          'Llevar lo observado a la propia clase.',
        ],
      },
      en: {
        title: 'The hive is a team',
        clase: 'Years 3–6',
        summary:
          'Thousands of bees and no boss. We work out how they share the jobs, how they tell each other where the flowers are, and why they decide better together.',
        longDesc:
          'A hive holds fifty thousand inhabitants and nobody gives orders. Each bee changes job over her lifetime — cleaning, nursing, building, guarding the door, flying out — and the whole thing works without anyone organising it from above. We look at how they announce where the flowers are through a dance that carries distance and direction, and we dance it in the classroom. Then we turn the question around: how is this class like a hive, and how is it not?',
        objetivos: [
          'Recognise an organisation that works without a boss.',
          'Describe how information travels inside a group.',
          'Apply what was observed to their own classroom.',
        ],
      },
    },
  },
  {
    id: 'frutas',
    numero: 3,
    lugar: 'aula',
    estado: 'disponible',
    edadMin: 10,
    edadMax: 15,
    duracion: 90,
    maxAlumnos: 30,
    meses: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    text: {
      es: {
        title: 'Sin abejas no hay frutas',
        clase: '5.° a Ciclo Básico',
        summary:
          'Polinización, cadena alimentaria y una mesa puesta. Sacamos de esa mesa todo lo que no existiría sin abejas y miramos lo que queda.',
        longDesc:
          'Ponemos una mesa con comida de verdad — manzanas, almendras, café, zapallo, miel — y empezamos a sacar de ella todo lo que depende de un insecto polinizador. Lo que queda al final sorprende a cualquiera. A partir de ahí trabajamos la polinización paso a paso, hablamos de qué hace desaparecer a las abejas y qué las trae de vuelta, y terminamos con algo concreto que la clase pueda hacer en el patio de su escuela. No es una charla sobre catástrofes: es una sobre cómo se sostiene lo que comemos.',
        objetivos: [
          'Explicar la polinización y su papel en la producción de alimentos.',
          'Argumentar por qué la biodiversidad no es un lujo.',
          'Proponer una acción concreta y realizable en la escuela.',
        ],
      },
      en: {
        title: 'Without bees there is no fruit',
        clase: 'Years 5 to lower secondary',
        summary:
          'Pollination, food chains and a laid table. We take off that table everything that would not exist without bees, and look at what is left.',
        longDesc:
          'We lay a table with real food — apples, almonds, coffee, squash, honey — and start removing everything that depends on a pollinating insect. What remains at the end surprises everybody. From there we work through pollination step by step, talk about what makes bees disappear and what brings them back, and finish with something concrete the class can do in their own school yard. It is not a talk about catastrophe: it is a talk about how what we eat holds together.',
        objetivos: [
          'Explain pollination and its role in food production.',
          'Argue why biodiversity is not a luxury.',
          'Propose one concrete action that is achievable at school.',
        ],
      },
    },
  },
  {
    id: 'chacra',
    numero: 4,
    lugar: 'chacra',
    /* Noch nicht buchbar: den Besuch auf der Chacra wird es erst in
       Zukunft geben. Die Karte bleibt trotzdem stehen — sie ist das Ziel
       des Weges und erklärt, wozu die drei Module in der Schule führen. */
    estado: 'proximamente',
    edadMin: 8,
    duracion: 180,
    maxAlumnos: 25,
    /* Andere Monate als die Module in der Schule: hier zählt die
       Bienensaison, nicht das Schuljahr. */
    meses: [10, 11, 12, 1, 2, 3, 4],
    text: {
      es: {
        title: 'Un día en la chacra',
        clase: 'Desde 3.°',
        summary:
          'Colmena de verdad, traje puesto y miel directo del panal. Todo lo aprendido en el aula, pero con las abejas adelante.',
        longDesc:
          'La visita a Retoños del Edén cierra el recorrido: lo que en el aula fue un dibujo acá zumba. Los chicos se ponen el traje, abrimos un cuadro y buscan la reina entre miles de obreras; prueban miel sin filtrar directo del panal; caminan el sendero entre los pistachos y la lavanda y ven de dónde sale lo que las abejas juntan. Es medio día entero y vuelve todo el mundo cansado.',
        objetivos: [
          'Reconocer en una colmena real lo trabajado en el aula.',
          'Vivir una experiencia directa con un animal que suele dar miedo.',
        ],
      },
      en: {
        title: 'A day on the farm',
        clase: 'From year 3',
        summary:
          'A real hive, a suit on and honey straight from the comb. Everything learned in class, but with the bees in front of you.',
        longDesc:
          'The visit to Retoños del Edén closes the route: what was a drawing in the classroom hums out here. The children put on the suit, we lift out a frame and they hunt for the queen among thousands of workers; they taste unfiltered honey straight from the comb; they walk the path between the pistachios and the lavender and see where what the bees gather comes from. It is a full half day and everybody goes home tired.',
        objetivos: [
          'Recognise in a real hive what was covered in the classroom.',
          'Have a direct experience with an animal that usually frightens people.',
        ],
      },
    },
  },
];

/**
 * Die Altersfilter über dem Weg.
 *
 * Bewusst kein automatisch aus den Modulen erzeugter Filter: die Spannen
 * überlappen sich (6–9, 8–12, 10–15), und eine Lehrkraft sucht nach ihrer
 * Klasse, nicht nach einer Zahl. Deshalb feste, sprechende Stufen.
 */
export interface FiltroEdad {
  id: string;
  /** Passt auf Module, deren Spanne diesen Bereich berührt. */
  desde: number;
  hasta: number;
  label: Record<Lang, string>;
}

export const filtrosEdad: FiltroEdad[] = [
  { id: '6-9', desde: 6, hasta: 9, label: { es: '6 a 9 años', en: 'Ages 6–9' } },
  { id: '8-12', desde: 8, hasta: 12, label: { es: '8 a 12 años', en: 'Ages 8–12' } },
  { id: '10-15', desde: 10, hasta: 15, label: { es: '10 a 15 años', en: 'Ages 10–15' } },
];

/** UI-Texte des Bereichs. Gehören zu diesem Datensatz, nicht in src/i18n. */
export interface AbejasEducanUI {
  kicker: string;
  title: string;
  intro: string;
  marca: string;
  filtroLabel: string;
  filtroTodas: string;
  enAula: string;
  enChacra: string;
  enAulaNota: string;
  enChacraNota: string;
  leerMas: string;
  cerrar: string;
  objetivos: string;
  duracion: string;
  minutos: string;
  horas: string;
  maxAlumnos: string;
  alumnos: string;
  meses: string;
  elegir: string;
  elegido: string;
  proximamente: string;
  proximamenteNota: string;
  sinResultados: string;
  /* Anfrage */
  seleccionados: string;
  ninguno: string;
  pedir: string;
  formTitle: string;
  formIntro: string;
  paso: string;
  pasoModulos: string;
  pasoFecha: string;
  pasoContacto: string;
  campoEscuela: string;
  campoDocente: string;
  campoMail: string;
  campoTel: string;
  campoAlumnos: string;
  campoClase: string;
  campoFecha1: string;
  campoFecha2: string;
  campoNota: string;
  consentimiento: string;
  privacidad: string;
  enviar: string;
  volver: string;
  siguiente: string;
  gracias: string;
  graciasTexto: string;
  noVinculante: string;
  /** Beschriftung des Absendeknopfes, solange gesendet wird. */
  enviando: string;
  /** Supabase nicht erreichbar oder nicht eingerichtet. */
  errorConexion: string;
  /** Die Datenbank hat abgelehnt (Prüfregel, Policy). */
  errorEnvio: string;
  /* Buch-Ankündigung */
  libroKicker: string;
  libroTitulo: string;
  libroTexto: string;
  libroFirma: string;
  mesesCortos: string[];
}

export const abejasEducanUI: Record<Lang, AbejasEducanUI> = {
  es: {
    kicker: 'Un proyecto educativo de Retoños del Edén',
    title: 'Las abejas educan',
    intro:
      'Las abejas no solo polinizan: enseñan. Cuatro módulos para escuelas, tres en el aula y uno acá en la chacra, pensados para que los chicos aprendan DE las abejas, no solo SOBRE ellas. Elegí los que te sirvan y pedinos un presupuesto.',
    marca: 'Las abejas educan',
    filtroLabel: 'Edad',
    filtroTodas: 'Todas',
    enAula: 'En el aula',
    enChacra: 'En la chacra',
    enAulaNota: 'Vamos nosotros a tu escuela, con todo el material.',
    enChacraNota: 'La visita que cierra el recorrido.',
    leerMas: 'Leer más',
    cerrar: 'Cerrar',
    objetivos: 'Objetivos',
    duracion: 'Duración',
    minutos: 'minutos',
    horas: 'horas',
    maxAlumnos: 'Grupo máximo',
    alumnos: 'alumnos',
    meses: 'Meses',
    elegir: 'Elegir módulo',
    elegido: 'Elegido',
    proximamente: 'Próximamente',
    proximamenteNota:
      'La visita a la chacra todavía se está preparando: falta terminar el camino y la sombra para recibir a un grupo entero. Avisanos si te interesa y te escribimos en cuanto abra.',
    sinResultados: 'Para esa edad todavía no tenemos módulo. Probá con otra franja.',
    seleccionados: 'módulos elegidos',
    ninguno: 'Todavía no elegiste ningún módulo',
    pedir: 'Pedir presupuesto',
    formTitle: 'Pedir presupuesto',
    formIntro:
      'Contanos qué te interesa y te mandamos una propuesta con fecha y precio. No es una reserva: la fecha la confirmamos por mail.',
    paso: 'Paso',
    pasoModulos: 'Qué módulos',
    pasoFecha: 'Cuándo',
    pasoContacto: 'Quién pregunta',
    campoEscuela: 'Escuela',
    campoDocente: 'Nombre del o la docente',
    campoMail: 'Correo',
    campoTel: 'Teléfono',
    campoAlumnos: 'Cantidad de alumnos',
    campoClase: 'Clase o año',
    campoFecha1: 'Primera fecha deseada',
    campoFecha2: 'Segunda fecha (por si la primera no se puede)',
    campoNota: '¿Algo más que debamos saber?',
    consentimiento:
      'Acepto que Retoños del Edén guarde estos datos para responder a esta consulta y coordinar la visita.',
    privacidad: 'Cómo cuidamos tus datos',
    enviar: 'Enviar solicitud',
    volver: 'Volver',
    siguiente: 'Siguiente',
    gracias: '¡Gracias!',
    graciasTexto:
      'Recibimos tu consulta. Te escribimos dentro de los próximos días con una propuesta y las fechas posibles.',
    noVinculante: 'Esto es una consulta, no una reserva. No te compromete a nada.',
    enviando: 'Enviando…',
    errorConexion:
      'No pudimos enviar la consulta: parece que no hay conexión. Tus datos siguen acá, probá de nuevo en un momento o escribinos a los contactos de más abajo.',
    errorEnvio:
      'Algo salió mal al guardar la consulta. Tus datos siguen acá: probá de nuevo, y si vuelve a fallar escribinos a los contactos de más abajo.',
    libroKicker: 'Se está escribiendo',
    libroTitulo: 'El libro que cuenta Meli',
    libroTexto:
      'Una abeja narra su propio mundo: cómo ve, cómo baila, cómo decide una colmena. El libro acompaña los módulos y después se queda en la biblioteca de la escuela, para el año que viene y el siguiente.',
    libroFirma: '— Meli, que todavía no terminó el capítulo tres',
    mesesCortos: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'],
  },
  en: {
    kicker: 'An educational project by Retoños del Edén',
    title: 'Bees teach',
    intro:
      'Bees do not only pollinate: they teach. Four modules for schools, three in your classroom and one here on the farm, built so that children learn FROM bees, not only ABOUT them. Pick the ones that suit you and ask us for a quote.',
    marca: 'Las abejas educan',
    filtroLabel: 'Age',
    filtroTodas: 'All',
    enAula: 'In the classroom',
    enChacra: 'On the farm',
    enAulaNota: 'We come to your school, with all the material.',
    enChacraNota: 'The visit that closes the route.',
    leerMas: 'Read more',
    cerrar: 'Close',
    objetivos: 'Learning goals',
    duracion: 'Length',
    minutos: 'minutes',
    horas: 'hours',
    maxAlumnos: 'Maximum group',
    alumnos: 'pupils',
    meses: 'Months',
    elegir: 'Choose module',
    elegido: 'Chosen',
    proximamente: 'Coming soon',
    proximamenteNota:
      'The farm visit is still being prepared: the path and the shade needed to receive a whole group are not finished. Tell us if you are interested and we will write as soon as it opens.',
    sinResultados: 'We have no module for that age yet. Try another range.',
    seleccionados: 'modules chosen',
    ninguno: 'You have not chosen any module yet',
    pedir: 'Ask for a quote',
    formTitle: 'Ask for a quote',
    formIntro:
      'Tell us what interests you and we will send a proposal with a date and a price. This is not a booking: we confirm the date by email.',
    paso: 'Step',
    pasoModulos: 'Which modules',
    pasoFecha: 'When',
    pasoContacto: 'Who is asking',
    campoEscuela: 'School',
    campoDocente: 'Teacher’s name',
    campoMail: 'Email',
    campoTel: 'Phone',
    campoAlumnos: 'Number of pupils',
    campoClase: 'Class or year',
    campoFecha1: 'Preferred date',
    campoFecha2: 'Second date (in case the first does not work)',
    campoNota: 'Anything else we should know?',
    consentimiento:
      'I agree that Retoños del Edén may store these details in order to answer this enquiry and arrange the visit.',
    privacidad: 'How we look after your data',
    enviar: 'Send enquiry',
    volver: 'Back',
    siguiente: 'Next',
    gracias: 'Thank you!',
    graciasTexto:
      'We have your enquiry. We will write within the next few days with a proposal and possible dates.',
    noVinculante: 'This is an enquiry, not a booking. It commits you to nothing.',
    enviando: 'Sending…',
    errorConexion:
      'We could not send the enquiry: there seems to be no connection. Your details are still here — try again in a moment, or write to us using the contact details further down.',
    errorEnvio:
      'Something went wrong while saving the enquiry. Your details are still here: please try again, and if it fails once more use the contact details further down.',
    libroKicker: 'Being written',
    libroTitulo: 'The book Meli tells',
    libroTexto:
      'A bee narrates her own world: how she sees, how she dances, how a hive makes up its mind. The book comes with the modules and then stays in the school library, for next year and the year after.',
    libroFirma: '— Meli, who has not finished chapter three',
    mesesCortos: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};
