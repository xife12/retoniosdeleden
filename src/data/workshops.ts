import type { Lang } from '../i18n';
import type { ThemeAccent, ThemeId } from './workshop-themes';

/**
 * Themen-Schlüssel und Akzentfarbe kommen aus dem Katalog in
 * `workshop-themes.ts` (dort liegen auch Karten-Icon und Kopfbild).
 * Bewusst nur re-exportiert statt hier dupliziert -- der Katalog ist die
 * einzige Quelle, sonst laufen Katalog und Typ auseinander.
 */
export type { ThemeAccent, ThemeId };

/** Währungen, die im Backend wählbar sind (siehe supabase/schema.sql). */
export type WorkshopCurrency = 'USD' | 'UYU' | 'EUR' | 'ARS';

/** Eine Station im Ablauf eines Workshops. */
export interface ProgrammeStep {
  title: string;
  text: string;
}

/**
 * Schalter für die Detail-Blöcke: die Nutzerin blendet im Backend einzelne
 * Abschnitte aus, statt sie leer zu lassen.
 */
export interface WorkshopShow {
  programme: boolean;
  included: boolean;
  bring: boolean;
  forWhom: boolean;
  languages: boolean;
  meetingPoint: boolean;
}

export interface WorkshopText {
  title: string;
  desc: string;
  audience: string;
  /** Ausführliche Beschreibung für die Detailansicht. */
  longDesc: string;
  /** Ablauf des Tages in Stationen. */
  programme: ProgrammeStep[];
  /** Was im Preis inbegriffen ist. */
  included: string[];
  /** Was die Gäste mitbringen sollen. */
  bring: string[];
  /** Für wen der Workshop geeignet ist (Alter, Vorkenntnisse). */
  forWhom: string;
  /** Angebotene Sprachen. */
  languages: string;
  /** Treffpunkt auf der Chacra. */
  meetingPoint: string;
}

export interface Workshop {
  /** Slug aus der Datenbank -- zugleich Anker-/Dialog-Id auf der Website. */
  id: string;
  themeId: ThemeId;
  /** Redundant zu `workshopThemes[themeId].accent`, aber bequem im Markup. */
  accent: ThemeAccent;
  price: number;
  currency: WorkshopCurrency;
  hours: number;
  maxPeople: number;
  instructorFirstName: string;
  instructorLastName: string;
  dates: string[]; // ISO-Datumsstrings
  show: WorkshopShow;
  text: Record<Lang, WorkshopText>;
}

/** Währungszeichen so, wie sie auf der Website vor dem Betrag stehen. */
export const currencyPrefix: Record<WorkshopCurrency, string> = {
  USD: 'US$',
  UYU: '$U',
  EUR: '€',
  ARS: 'AR$',
};

/**
 * Preis für die Anzeige: ganze Beträge ohne Nachkommastellen
 * (`US$ 25`), krumme mit zweien (`US$ 45,50` bleibt `US$ 45.50` --
 * bewusst Punkt, weil die Beträge aus dem Backend so eingegeben werden).
 */
export function formatPrice(price: number, currency: WorkshopCurrency): string {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return `${currencyPrefix[currency]} ${amount}`;
}

/**
 * UI-Beschriftungen des Detail-Dialogs.
 * Bewusst hier und nicht in src/i18n, damit die Workshop-Detailansicht
 * mit ihren Daten zusammen an einer Stelle gepflegt wird.
 */
export interface WorkshopDetailUI {
  /** Beschriftung des Triggers auf der Karte. */
  more: string;
  close: string;
  programme: string;
  included: string;
  bring: string;
  forWhom: string;
  languages: string;
  meetingPoint: string;
  atAGlance: string;
}

export const workshopDetailUI: Record<Lang, WorkshopDetailUI> = {
  es: {
    more: 'Ver el taller',
    close: 'Cerrar',
    programme: 'Cómo es el encuentro',
    included: 'Qué incluye',
    bring: 'Qué traer',
    forWhom: 'Para quién es',
    languages: 'Idiomas',
    meetingPoint: 'Punto de encuentro',
    atAGlance: 'De un vistazo',
  },
  en: {
    more: 'See the workshop',
    close: 'Close',
    programme: 'How the day goes',
    included: "What's included",
    bring: 'What to bring',
    forWhom: 'Who it is for',
    languages: 'Languages',
    meetingPoint: 'Meeting point',
    atAGlance: 'At a glance',
  },
};

/** Alle Detail-Blöcke sichtbar -- der Zustand, den ein neuer Workshop erbt. */
const showAll: WorkshopShow = {
  programme: true,
  included: true,
  bring: true,
  forWhom: true,
  languages: true,
  meetingPoint: true,
};

/**
 * Ausgangsbestand der fünf Workshops.
 *
 * Die Website liest diese Liste NICHT mehr -- sie kommt über
 * `src/lib/fetch-workshops.ts` aus Supabase. Das Array ist die lesbare
 * Vorlage, aus der `supabase/seed.sql` erzeugt wurde, und bleibt als
 * Referenz stehen (z. B. um ein zweites Projekt zu befüllen).
 */
export const workshops: Workshop[] = [
  {
    id: 'abejas',
    themeId: 'bee',
    accent: 'miel',
    price: 25,
    currency: 'USD',
    hours: 2,
    maxPeople: 12,
    instructorFirstName: '',
    instructorLastName: '',
    dates: ['2026-08-08', '2026-08-22', '2026-09-05'],
    show: showAll,
    text: {
      es: {
        title: 'El mundo de las abejas',
        desc: 'Abrimos una colmena juntos: cómo vivimos las abejas, por qué polinizamos medio planeta y cómo nace la miel. Con degustación directa del panal.',
        audience: 'Familias, escuelas y curiosos',
        longDesc:
          'Las colmenas viven en el noroeste de la chacra, al reparo de la cortina de eucaliptos y a pocos metros de la lavanda. Ahí te ponés el traje, abrimos un cuadro y ves de cerca lo que casi nadie llega a ver: la reina, las obreras, la miel todavía tibia adentro del panal. Catalina cuenta por qué sin estas abejas no habría pistachos, ni lavanda, ni casi nada.',
        programme: [
          {
            title: 'Bienvenida y mate',
            text: 'Nos juntamos en la Casa de Barro 1, tomamos mate y repasamos las tres reglas para estar tranquilos cerca de una colmena.',
          },
          {
            title: 'Camino a las colmenas',
            text: 'Caminamos el sendero circular hasta el noroeste, entre las hileras de pistachos y la lavanda en flor. Diez minutos, con sombra casi todo el trayecto.',
          },
          {
            title: 'Abrimos la colmena',
            text: 'Con traje y ahumador abrimos una colmena de verdad. Buscamos la reina, miramos la cría y entendemos quién hace qué ahí adentro.',
          },
          {
            title: 'Polen, cera y miel',
            text: 'Pasamos un cuadro de mano en mano, olemos la cera tibia y probamos miel directo del panal, sin filtrar.',
          },
          {
            title: 'Cierre en el tajamar',
            text: 'Terminamos junto al agua hablando de calendula, de floración y de por qué las abejas eligieron quedarse en esta chacra.',
          },
        ],
        included: [
          'Traje de apicultor y velo para cada persona, en talles de niño y de adulto',
          'Degustación de miel recién sacada del panal',
          'Un trocito de panal de cera para llevarte',
          'Mate, agua fresca y bizcochos',
          'Grupo chico con dos personas del equipo siempre presentes',
        ],
        bring: [
          'Ropa clara y de manga larga: las abejas se ponen nerviosas con el negro',
          'Calzado cerrado, el sendero es de tierra',
          'Gorro, protector solar y tu botella de agua',
          'Si tenés alergia conocida a picaduras, avisanos antes de reservar',
        ],
        forWhom:
          'Desde los 6 años, siempre con un adulto acompañante. No hace falta ninguna experiencia previa: para la mayoría es la primera colmena abierta de su vida.',
        languages:
          'Español e inglés. Si preferís inglés, marcalo al reservar y guía Stefan.',
        meetingPoint:
          'Casa de Barro 1, junto al portón de entrada. Hay sombra y lugar de sobra para dejar el auto.',
      },
      en: {
        title: 'The world of bees',
        desc: 'We open a hive together: how bees live, why we pollinate half the planet, and how honey is born. Includes a tasting straight from the comb.',
        audience: 'Families, schools & the curious',
        longDesc:
          'The hives live in the northwest corner of the farm, sheltered by the eucalyptus belt and a few steps from the lavender. That is where you put on the suit, we lift out a frame, and you see up close what almost nobody gets to see: the queen, the workers, honey still warm inside the comb. Catalina explains why without these bees there would be no pistachios, no lavender, almost nothing.',
        programme: [
          {
            title: 'Welcome and mate',
            text: 'We meet at Casa de Barro 1, share a round of mate and go through the three rules for staying calm around a hive.',
          },
          {
            title: 'Walk to the hives',
            text: 'We follow the circular path to the northwest, between the pistachio rows and the flowering lavender. Ten minutes, shaded almost the whole way.',
          },
          {
            title: 'Opening the hive',
            text: 'In full suit and with the smoker we open a working hive. We look for the queen, study the brood and work out who does what in there.',
          },
          {
            title: 'Pollen, wax and honey',
            text: 'A frame is passed from hand to hand, we smell the warm wax and taste unfiltered honey straight from the comb.',
          },
          {
            title: 'Closing by the tajamar',
            text: 'We finish beside the pond talking about calendula, bloom times and why the bees decided to stay on this farm.',
          },
        ],
        included: [
          'Beekeeping suit and veil for everyone, in child and adult sizes',
          'Tasting of honey taken from the comb that morning',
          'A small piece of wax comb to take home',
          'Mate, cold water and biscuits',
          'Small group with two of our team present at all times',
        ],
        bring: [
          'Light coloured, long sleeved clothes: bees get nervous around black',
          'Closed shoes, the path is bare earth',
          'Hat, sunscreen and your water bottle',
          'If you have a known sting allergy, tell us before you book',
        ],
        forWhom:
          'From age 6, always with an accompanying adult. No experience needed: for most people this is the first open hive of their life.',
        languages:
          'Spanish and English. Ask for English when you book and Stefan guides the group.',
        meetingPoint:
          'Casa de Barro 1, right by the entrance gate. Shade and plenty of room to leave the car.',
      },
    },
  },
  {
    id: 'lavanda',
    themeId: 'lavender',
    accent: 'lavanda',
    price: 45,
    currency: 'USD',
    hours: 3,
    maxPeople: 10,
    instructorFirstName: '',
    instructorLastName: '',
    dates: ['2026-08-15', '2026-09-12', '2026-10-03'],
    show: showAll,
    text: {
      es: {
        title: 'Lavanda y jabones naturales',
        desc: 'Cosechamos lavanda entre los pistachos, destilamos aceite esencial y cada quien se lleva su propio jabón hecho a mano.',
        audience: 'Adultos y adolescentes',
        longDesc:
          'La lavanda crece entre las hileras de pistachos y no está ahí de adorno: llama a los polinizadores y despista a las plagas. Cortamos a mano, cargamos el alambique de cobre y esperamos juntos las primeras gotas. Con esa agua floral, aceite de oliva y calendula de la chacra armás tu propio pan de jabón, envuelto en papel para que termine de curar en tu casa.',
        programme: [
          {
            title: 'Bienvenida y mate',
            text: 'Arrancamos bajo el alero de la Casa de Barro 2 con mate y un repaso tranquilo de todo lo que vamos a hacer.',
          },
          {
            title: 'Cosecha entre las hileras',
            text: 'Cortamos lavanda con hoz entre los pistachos, en el momento del día en que el aceite está más concentrado.',
          },
          {
            title: 'Destilación en cobre',
            text: 'Cargamos el alambique y miramos salir las primeras gotas. Mientras destila, contamos cómo la lavanda cuida a los 600 árboles.',
          },
          {
            title: 'Armás tu jabón',
            text: 'Mezclamos aceite de oliva, agua floral y pétalos de calendula. Cada quien arma su pan y le elige el aroma y el molde.',
          },
          {
            title: 'Mesa de aromas',
            text: 'Cerramos con una cata de olores: lavanda fresca, lavanda seca, aceite esencial puro y miel de la casa para comparar.',
          },
        ],
        included: [
          'Toda la materia prima: aceite de oliva, agua floral, calendula y moldes',
          'Tu pan de jabón envuelto en papel, listo para curar en casa',
          'Un frasquito de hidrolato de lavanda de la tanda del día',
          'Hoz, guantes y canasto para la cosecha',
          'Mate, agua y algo dulce a media mañana',
          'La receta impresa para repetirlo en tu cocina',
        ],
        bring: [
          'Ropa que pueda mancharse: la calendula tiñe y no se arrepiente',
          'Calzado cerrado para andar entre las hileras',
          'Gorro y protector solar, la cosecha es a pleno campo',
          'Una caja o bolsa de tela para llevar el jabón sin apretarlo',
        ],
        forWhom:
          'Desde los 14 años. No se necesita experiencia: trabajamos con una base ya preparada, así nadie tiene que manipular soda cáustica.',
        languages: 'Español e inglés. La receta te la damos en los dos idiomas.',
        meetingPoint:
          'Alero de la Casa de Barro 2, al final del camino de entrada. Seguí los carteles de madera.',
      },
      en: {
        title: 'Lavender & natural soaps',
        desc: 'We harvest lavender between the pistachio rows, distill essential oil, and everyone takes home their own handmade soap.',
        audience: 'Adults & teens',
        longDesc:
          'The lavender grows between the pistachio rows and it is not decoration: it calls in pollinators and throws pests off the scent. We cut by hand, load the copper still and wait together for the first drops. With that floral water, olive oil and calendula from the farm you make your own bar of soap, wrapped in paper so it can finish curing at home.',
        programme: [
          {
            title: 'Welcome and mate',
            text: 'We start under the eaves of Casa de Barro 2 with mate and a calm walk through everything we are about to do.',
          },
          {
            title: 'Harvest between the rows',
            text: 'We cut lavender by sickle among the pistachios, at the hour of the day when the oil is at its most concentrated.',
          },
          {
            title: 'Distilling in copper',
            text: 'We load the still and watch the first drops appear. While it runs, we explain how the lavender looks after all 600 trees.',
          },
          {
            title: 'Make your soap',
            text: 'We blend olive oil, floral water and calendula petals. Everyone shapes their own bar and picks the scent and the mould.',
          },
          {
            title: 'Table of scents',
            text: 'We close with a smelling flight: fresh lavender, dried lavender, pure essential oil and our own honey for comparison.',
          },
        ],
        included: [
          'All the raw material: olive oil, floral water, calendula and moulds',
          'Your bar of soap wrapped in paper, ready to cure at home',
          'A small bottle of lavender hydrosol from that same batch',
          'Sickle, gloves and a basket for the harvest',
          'Mate, water and something sweet mid morning',
          'The printed recipe so you can repeat it in your own kitchen',
        ],
        bring: [
          'Clothes that are allowed to get stained: calendula dyes and never apologises',
          'Closed shoes for walking between the rows',
          'Hat and sunscreen, the harvest happens in open field',
          'A box or cloth bag so the soap travels home without being squashed',
        ],
        forWhom:
          'From age 14. No experience needed: we work from a pre made base, so nobody has to handle caustic soda.',
        languages: 'Spanish and English. You get the recipe in both languages.',
        meetingPoint:
          'The covered porch of Casa de Barro 2, at the end of the entrance track. Follow the wooden signs.',
      },
    },
  },
  {
    id: 'pistacho',
    themeId: 'pistachio',
    accent: 'pistacho',
    price: 60,
    currency: 'USD',
    hours: 2.5,
    maxPeople: 8,
    instructorFirstName: '',
    instructorLastName: '',
    dates: ['2026-08-29', '2026-09-19', '2026-10-10'],
    show: showAll,
    text: {
      es: {
        title: 'Plantá tu pistacho',
        desc: 'Plantás tu propio árbol en la primera plantación del país, con nombre y padrinazgo incluidos. Volvé cuando quieras a ver cuánto creció.',
        audience: 'Para todas las edades',
        longDesc:
          'Hoy hay 600 pistachos en la chacra y el tuyo va a ser uno más, con su chapita, su número y su lugar en el plano. Stefan cuenta por qué el pistacho tarda siete años en dar la primera cosecha y por qué igual vale la pena plantarlo. Vos cavás, plantás, regás y te llevás la fila y el número anotados para volver cuando quieras.',
        programme: [
          {
            title: 'Bienvenida y recorrida',
            text: 'Caminamos el sendero circular y vemos las hileras: las más viejas, las del año pasado y el lugar donde vas a plantar hoy.',
          },
          {
            title: 'Macho, hembra y viento',
            text: 'Diez minutos de teoría al pie del árbol: por qué el pistacho necesita pareja y por qué acá la cortina de eucaliptos es tan importante.',
          },
          {
            title: 'Preparar el hoyo',
            text: 'Cavamos, mezclamos la tierra con compost de la chacra y revisamos juntos cómo llega el riego por goteo hasta la fila.',
          },
          {
            title: 'Plantás tu árbol',
            text: 'Plantás, regás y le colgás la chapita con tu nombre. Anotamos fila y número en el plano de la plantación.',
          },
          {
            title: 'Brindis a la sombra',
            text: 'Cerramos con limonada de la casa junto al tajamar y las fotos de rigor abrazando un arbolito de 40 centímetros.',
          },
        ],
        included: [
          'Tu plantín de pistacho, ya adaptado al suelo y al clima de acá',
          'Chapita grabada con tu nombre y el número de árbol',
          'Padrinazgo por tres años: cada primavera te mandamos una foto de tu árbol',
          'Herramientas, guantes y compost de la chacra',
          'Limonada, agua y bizcochos',
          'Entrada libre a la chacra siempre que quieras visitarlo',
        ],
        bring: [
          'Ropa de trabajo, acá se cava tierra de verdad',
          'Calzado cerrado, y mejor botas si llovió los días previos',
          'Gorro y protector solar, la plantación no tiene sombra',
          'Cámara o teléfono para la primera foto con tu árbol',
        ],
        forWhom:
          'Para todas las edades. Los más chicos plantan con ayuda y tienen sus propias herramientas chicas. No hace falta saber nada de jardinería.',
        languages: 'Español e inglés, según cómo venga el grupo.',
        meetingPoint:
          'Portón de entrada, junto al cartel de madera. Desde ahí vamos caminando hasta el vivero.',
      },
      en: {
        title: 'Plant your pistachio',
        desc: "Plant your own tree in the country's first plantation, name tag and sponsorship included. Come back anytime to see how much it has grown.",
        audience: 'All ages',
        longDesc:
          'There are 600 pistachios on the farm today and yours becomes one more, with its tag, its number and its place on the map. Stefan explains why a pistachio takes seven years to give its first harvest, and why it is worth planting anyway. You dig, you plant, you water, and you leave with the row and number written down so you can come back whenever you like.',
        programme: [
          {
            title: 'Welcome and walk',
            text: 'We follow the circular path and look at the rows: the oldest ones, the trees planted last winter, and the spot where you will plant today.',
          },
          {
            title: 'Male, female and wind',
            text: 'Ten minutes of theory at the foot of a tree: why pistachios need a partner, and why the eucalyptus belt matters so much here.',
          },
          {
            title: 'Preparing the hole',
            text: 'We dig, mix the soil with compost from the farm and check together how the drip line reaches your row.',
          },
          {
            title: 'Plant your tree',
            text: 'You plant, you water, you hang the tag with your name. We note the row and number on the plantation map.',
          },
          {
            title: 'A toast in the shade',
            text: 'We finish with homemade lemonade by the tajamar and the obligatory photo hugging a 40 centimetre sapling.',
          },
        ],
        included: [
          'Your pistachio sapling, already adapted to the soil and climate here',
          'Engraved tag with your name and the tree number',
          'Three years of sponsorship: every spring we send you a photo of your tree',
          'Tools, gloves and compost from the farm',
          'Lemonade, water and biscuits',
          'Free entry to the farm whenever you want to visit it',
        ],
        bring: [
          'Work clothes, there is real digging involved',
          'Closed shoes, boots if it rained in the days before',
          'Hat and sunscreen, the plantation has no shade',
          'Camera or phone for the first photo with your tree',
        ],
        forWhom:
          'All ages. Younger children plant with help and get their own small tools. No gardening knowledge needed at all.',
        languages: 'Spanish and English, depending on the group.',
        meetingPoint:
          'The entrance gate, next to the wooden sign. From there we walk together to the nursery.',
      },
    },
  },
  {
    id: 'organico',
    themeId: 'organic',
    accent: 'pistacho',
    price: 50,
    currency: 'USD',
    hours: 4,
    maxPeople: 12,
    instructorFirstName: '',
    instructorLastName: '',
    dates: ['2026-09-26', '2026-10-17', '2026-10-31'],
    show: showAll,
    text: {
      es: {
        title: 'Cultivar orgánico',
        desc: 'Suelo vivo, mezcla de cultivos, cero químicos: los fundamentos del cultivo orgánico certificado según el estándar europeo, aplicados en la chacra real.',
        audience: 'Huerteros y productores',
        longDesc:
          'Cuatro horas de chacra de verdad, sin diapositivas. Miramos el suelo con la pala en la mano, contamos lombrices, revisamos por qué va calendula entre las hileras y qué hacemos cuando aparece una plaga y no podemos usar nada de síntesis. Catalina abre además la carpeta de la certificación europea: qué se anota, qué se controla y cuánto trabajo administrativo es en realidad.',
        programme: [
          {
            title: 'Mate y presentaciones',
            text: 'Arrancamos con mate y una vuelta de mesa: qué cultiva cada quien, en cuánta tierra y qué problema concreto trae.',
          },
          {
            title: 'Calicata: el suelo por dentro',
            text: 'Abrimos un pozo entre dos hileras de pistachos y leemos el perfil: raíces, lombrices, estructura, color y olor.',
          },
          {
            title: 'Cobertura y mezcla de cultivos',
            text: 'Recorremos las hileras y vemos lavanda, calendula y abonos verdes trabajando entre los 600 árboles.',
          },
          {
            title: 'Plagas sin química',
            text: 'Casos concretos de la temporada pasada: qué funcionó, qué no y qué salió carísimo. Preparamos juntos un purín.',
          },
          {
            title: 'La carpeta de certificación',
            text: 'A la sombra del tajamar abrimos los registros reales, las actas de auditoría y los errores del primer año.',
          },
        ],
        included: [
          'Cuaderno de campo con las recetas, las tablas y los formularios que usamos',
          'Almuerzo liviano de huerta bajo los eucaliptos',
          'Muestra de compost y de purín para arrancar en tu casa',
          'Palas, barreno y todo lo necesario para la calicata',
          'Consulta por mail con Catalina durante los tres meses siguientes',
        ],
        bring: [
          'Ropa de campo y calzado cerrado, mejor botas',
          'Gorro, protector solar y bastante agua',
          'Tus preguntas concretas y, si podés, fotos de tu suelo o de tu cultivo',
          'Una muestra de tu tierra en una bolsa, si querés que la miremos juntos',
        ],
        forWhom:
          'Pensado para quien ya tiene huerta, quinta o chacra, o está por empezar en serio. Desde los 16 años. No hace falta formación técnica, sí ganas de meter las manos en la tierra.',
        languages:
          'Español e inglés. El cuaderno de campo viene en los dos idiomas.',
        meetingPoint:
          'Casa de Barro 1. Dejá el auto a la sombra junto al portón y seguí el olor a mate.',
      },
      en: {
        title: 'Growing organic',
        desc: 'Living soil, mixed cropping, zero chemicals: the foundations of organic growing certified to the European standard, applied on a real working farm.',
        audience: 'Gardeners & growers',
        longDesc:
          'Four hours of real farm, no slide deck. We look at the soil with a spade in hand, count earthworms, work out why calendula belongs between the rows and what we actually do when a pest arrives and nothing synthetic is allowed. Catalina also opens the European certification folder: what gets recorded, what gets audited and how much paperwork it really is.',
        programme: [
          {
            title: 'Mate and introductions',
            text: 'We start with mate and a round of introductions: what everyone grows, on how much land, and the specific problem they brought.',
          },
          {
            title: 'Soil pit: the ground from inside',
            text: 'We dig a pit between two pistachio rows and read the profile: roots, worms, structure, colour and smell.',
          },
          {
            title: 'Cover crops and mixed planting',
            text: 'We walk the rows and see lavender, calendula and green manure at work among the 600 trees.',
          },
          {
            title: 'Pests without chemistry',
            text: 'Real cases from last season: what worked, what did not, what got expensive. We brew a plant tea together.',
          },
          {
            title: 'The certification folder',
            text: 'In the shade by the tajamar we open the actual records, the audit reports and the first year mistakes.',
          },
        ],
        included: [
          'Field notebook with the recipes, tables and forms we use',
          'Light garden lunch under the eucalyptus',
          'A sample of compost and plant tea to get started at home',
          'Spades, auger and everything needed for the soil pit',
          'Email follow up with Catalina for three months afterwards',
        ],
        bring: [
          'Field clothes and closed shoes, boots are better',
          'Hat, sunscreen and plenty of water',
          'Your specific questions and, if you can, photos of your soil or crop',
          'A bag of your own soil if you want us to look at it together',
        ],
        forWhom:
          'Made for people who already have a garden, smallholding or farm, or are about to start seriously. From age 16. No technical training required, just a willingness to get your hands in the dirt.',
        languages: 'Spanish and English. The field notebook comes in both.',
        meetingPoint:
          'Casa de Barro 1. Park in the shade by the gate and follow the smell of mate.',
      },
    },
  },
  {
    id: 'barro',
    themeId: 'clay',
    accent: 'barro',
    price: 80,
    currency: 'USD',
    hours: 7,
    maxPeople: 10,
    instructorFirstName: '',
    instructorLastName: '',
    dates: ['2026-09-06', '2026-10-04', '2026-11-01'],
    show: showAll,
    text: {
      es: {
        title: 'Construir con barro',
        desc: 'Un día entero de bioconstrucción: mezclamos barro del terreno, levantamos pared en la casa 3 y aprendés por qué estas casas respiran.',
        audience: 'Manos que quieren embarrarse',
        longDesc:
          'Un día entero levantando pared en la Casa de Barro 3, la que todavía está en obra. Sacamos la tierra del propio terreno, la probamos con la prueba del frasco, la mezclamos con arena y paja y la subimos al muro. Al final del día vas a tener una pared que a la mañana no existía, las manos hechas un desastre y una idea bastante clara de por qué estas casas son frescas en verano y abrigadas en invierno.',
        programme: [
          {
            title: 'Café y recorrida por las tres casas',
            text: 'Empezamos temprano con café y bizcochos y recorremos la casa terminada, la habitada y la que vamos a seguir hoy.',
          },
          {
            title: 'Conocer la tierra',
            text: 'Prueba del frasco, prueba de la bolita y prueba de la cinta. Aprendés a leer si una tierra sirve para construir o no.',
          },
          {
            title: 'Pisar la mezcla',
            text: 'Barro, arena y paja sobre una lona grande. Se mezcla con los pies y suele ser la parte que más se disfruta.',
          },
          {
            title: 'Levantar pared',
            text: 'Subimos la mezcla al muro de la casa 3, entre los parantes de madera. Se trabaja en duplas y se ve avanzar hora a hora.',
          },
          {
            title: 'Revoque fino y cierre',
            text: 'A la tarde probamos revoque con arena tamizada y cal, y hablamos de cómo se mantiene una casa de barro con los años.',
          },
        ],
        included: [
          'Almuerzo casero y largo bajo los eucaliptos, más café y bizcochos a la mañana',
          'Todos los materiales: tierra del terreno, arena, paja y cal',
          'Herramientas, baldes, lonas y guantes',
          'Una ficha con las tres pruebas de suelo y las proporciones de mezcla',
          'Un ladrillito de barro hecho por vos, para llevarte cuando seque',
        ],
        bring: [
          'Ropa vieja de pies a cabeza: el barro no sale del todo, nunca',
          'Un cambio completo de ropa y una toalla',
          'Botas de goma o championes que puedas ensuciar sin culpa',
          'Gorro, protector solar y ganas de estar de pie casi todo el día',
        ],
        forWhom:
          'Desde los 16 años. Es un día físico: se levanta peso, se pisa barro y se trabaja al sol. No hace falta experiencia en construcción, sí buena predisposición.',
        languages:
          'Español e inglés, y alemán si hace falta: Stefan explica la técnica en los tres.',
        meetingPoint:
          'Casa de Barro 3, la que está en obra. Se llega por el sendero circular desde el portón, cinco minutos a pie.',
      },
      en: {
        title: 'Building with clay',
        desc: 'A full day of natural building: we mix clay from the land, raise a wall at house 3, and you learn why these houses breathe.',
        audience: 'Hands ready to get muddy',
        longDesc:
          'A full day raising a wall at Casa de Barro 3, the one still under construction. We take the earth from the land itself, test it with the jar test, mix it with sand and straw and lift it onto the wall. By the end of the day you will have a wall that did not exist that morning, hands in a hopeless state, and a clear idea of why these houses stay cool in summer and warm in winter.',
        programme: [
          {
            title: 'Coffee and a tour of the three houses',
            text: 'We start early with coffee and biscuits and walk through the finished house, the lived in one, and the one we continue today.',
          },
          {
            title: 'Getting to know the earth',
            text: 'Jar test, ball test and ribbon test. You learn to read whether a soil is fit to build with or not.',
          },
          {
            title: 'Treading the mix',
            text: 'Clay, sand and straw on a big tarp. It is mixed with your feet and it is usually the part everyone enjoys most.',
          },
          {
            title: 'Raising the wall',
            text: 'We lift the mix onto the wall of house 3, between the timber posts. We work in pairs and you watch it grow hour by hour.',
          },
          {
            title: 'Fine plaster and closing',
            text: 'In the afternoon we try a finish plaster with sieved sand and lime, and talk about how a clay house is maintained over the years.',
          },
        ],
        included: [
          'A long homemade lunch under the eucalyptus, plus coffee and biscuits in the morning',
          'All materials: earth from the land, sand, straw and lime',
          'Tools, buckets, tarps and gloves',
          'A handout with the three soil tests and the mixing ratios',
          'A small clay brick made by you, to collect once it has dried',
        ],
        bring: [
          'Old clothes head to toe: clay never fully washes out',
          'A complete change of clothes and a towel',
          'Rubber boots or trainers you can ruin without regret',
          'Hat, sunscreen and the willingness to stand up most of the day',
        ],
        forWhom:
          'From age 16. It is a physical day: lifting, treading clay and working in the sun. No building experience needed, just a good attitude.',
        languages:
          'Spanish and English, and German if needed: Stefan explains the technique in all three.',
        meetingPoint:
          'Casa de Barro 3, the one under construction. Take the circular path from the gate, five minutes on foot.',
      },
    },
  },
];

export function formatDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-UY' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
}
