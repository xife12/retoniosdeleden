import type { Lang } from '../i18n';
import type { CasaGlyph } from './casa-glyphs';

/**
 * Datenmodell der Lehmhäuser für den Detail-Dialog in Stay.astro.
 *
 * Aufbau wie workshops.ts: technische Fakten sprachneutral,
 * alle Texte in `text: Record<Lang, ...>`.
 *
 * Die Inhalte kommen zur Bauzeit aus Supabase (`src/lib/fetch-casas.ts`).
 * Das Array unten ist nur noch die lesbare Vorlage, aus der
 * `supabase/seed.sql` erzeugt wurde.
 */

/**
 * Baufortschritt wie in der Karten-Legende (t.map.status).
 * In der Datenbank heißt das Feld `build_status` -- `casas.status`
 * trägt dort seit dem Entwurf/Veröffentlichen-Umbau den
 * Veröffentlichungszustand (draft/published/archived).
 */
export type CasaStatus = 'listo' | 'enObra' | 'planeado';

/**
 * Glyph-Schlüssel aus dem Zeichnungs-Katalog `casa-glyphs.ts`
 * (alle 20 Motive). Nur re-exportiert, nicht dupliziert.
 */
export type { CasaGlyph };

/**
 * Aquarell-Platzhalter der Galerie, gezeichnet in Stay.astro
 * (Konstante `artwork`). Wird gezeigt, solange ein Haus noch keine
 * echten Fotos in `casa_images` hat.
 */
export type CasaArt =
  | 'c1-fachada'
  | 'c1-galeria'
  | 'c1-interior'
  | 'c1-detalle'
  | 'c2-obra'
  | 'c2-tub'
  | 'c2-interior'
  | 'c3-plano'
  | 'c3-vision'
  | 'c3-terreno';

/** Ein echtes Foto aus dem Storage-Bucket `casa-photos`. */
export interface CasaImage {
  id: string;
  url: string;
  /** Bildbeschreibung in der gerade gerenderten Sprache. */
  alt: string;
}

export interface CasaListItem {
  glyph: CasaGlyph;
  label: string;
}

export interface CasaHighlight {
  glyph: CasaGlyph;
  label: string;
  note: string;
}

export interface CasaText {
  /** Name des Hauses, z. B. „Casa de Barro 1". */
  title: string;
  /** Ein Satz unter dem Titel -- auf der Karte und im Dialog. */
  tagline: string;
  /** Lange Beschreibung, ein Absatz pro Eintrag. */
  body: string[];
  amenities: CasaListItem[];
  highlights: CasaHighlight[];
  /** Fotos in Sortierreihenfolge; leer => Aquarell-Platzhalter. */
  images: CasaImage[];
  /** Ehrlicher Hinweis zum tatsächlichen Buchungsstand. */
  bookNote: string;
}

export interface CasaFacts {
  beds: number;
  guests: number;
  /** m² */
  area: number;
  bedrooms: number;
  bathrooms: number;
}

export interface Casa {
  /** Slug aus der Datenbank -- zugleich Dialog-Id auf der Website. */
  id: string;
  status: CasaStatus;
  facts: CasaFacts;
  /**
   * Inserats-URL. Fehlt sie, zeigt der Dialog statt des Buttons
   * einen Hinweis plus Link zum Kontaktformular.
   */
  airbnbUrl?: string;
  text: Record<Lang, CasaText>;
}

/**
 * Ausgangsbestand der drei Lehmhäuser.
 *
 * WICHTIG: Ausstattungs- und Faktenwerte sind DEMO-INHALTE. Sie klingen
 * plausibel für die Chacra, sind aber nicht verbindlich. Gepflegt wird
 * ab jetzt im Backend unter /admin, nicht mehr hier.
 */
export const casas: Casa[] = [
  {
    id: 'casa-1',
    status: 'listo',
    // DEMO-WERTE
    facts: { beds: 2, guests: 3, area: 45, bedrooms: 1, bathrooms: 1 },
    airbnbUrl: 'https://www.airbnb.com/',
    text: {
      es: {
        title: 'Casa de Barro 1',
        tagline: 'La primera de todas: la que probó que el barro aguanta.',
        body: [
          'Catalina y Stefan la levantaron con la tierra que salió del propio terreno, mezclada con paja y agua, sin comprar un solo ladrillo. Las paredes tienen casi medio metro de espesor y eso se siente apenas entrás: en enero adentro hace fresco sin aire acondicionado, y en julio guardan el calor de la estufa hasta la mañana siguiente.',
          'El techo de quincho cae en una curva larga sobre la galería. Ahí está la hamaca amarilla que ya tiene su gente fija, dos colmenas apoyadas contra la baranda y una mesa donde el desayuno se estira más de lo previsto. Desde la silla se ven las hileras de pistachos bajando hacia el tajamar.',
          'Alrededor hay canto rodado, agapantos que florecen violeta en diciembre y el zumbido constante que viene del noroeste, donde están las colmenas grandes. La casa está habitada, así que se abre a huéspedes en fechas puntuales: si coincide con tu viaje, es el mejor lugar para entender de qué se trata todo esto.',
        ],
        amenities: [
          { glyph: 'kitchen', label: 'Cocina equipada con heladera, anafe a gas y pava eléctrica' },
          { glyph: 'bath', label: 'Baño completo con ducha de agua caliente' },
          { glyph: 'bed', label: 'Ropa de cama de algodón y frazadas de lana de oveja' },
          { glyph: 'hammock', label: 'Galería con hamaca y mesa para desayunar afuera' },
          { glyph: 'lavender', label: 'Ramo de lavanda de la chacra, cortado el día que llegás' },
          { glyph: 'mirador', label: 'Sendero al mirador a diez minutos caminando' },
        ],
        highlights: [
          {
            glyph: 'stove',
            label: 'Estufa de barro a leña',
            note: 'Hecha a mano con la misma tierra de las paredes. Tres leños alcanzan para toda la noche.',
          },
          {
            glyph: 'solar',
            label: 'Luz solar propia',
            note: 'Paneles y baterías en el galpón. La casa nunca estuvo conectada a la red eléctrica.',
          },
          {
            glyph: 'rain',
            label: 'Agua de lluvia',
            note: 'El quincho junta el agua en un tanque de mil litros que abastece la huerta y la ducha.',
          },
          {
            glyph: 'hive',
            label: 'Colmenas en la galería',
            note: 'Dos cajones al borde del deck. Se pueden mirar de cerca, con velo prestado y calma.',
          },
        ],
        images: [],
        bookNote:
          'La casa está terminada y habitada, así que se abre a huéspedes en fechas puntuales. Escribinos antes de reservar y coordinamos.',
      },
      en: {
        title: 'Clay House 1',
        tagline: 'The first one of all: the house that proved clay holds up.',
        body: [
          'Catalina and Stefan raised it with earth dug from the land itself, mixed with straw and water, without buying a single brick. The walls are almost half a metre thick and you feel it the moment you step in: in January it stays cool inside with no air conditioning, and in July it holds the heat of the stove until the next morning.',
          'The thatched roof falls in one long curve over the veranda. That is where the yellow hammock lives, along with two beehives leaning against the railing and a table where breakfast tends to run far longer than planned. From the chair you look straight down the pistachio rows toward the pond.',
          'Around the house there is gravel, agapanthus that flower violet in December, and the steady hum drifting in from the north west, where the big hives stand. The house is lived in, so it opens to guests on selected dates. If it lines up with your trip, it is the best place to understand what all of this is about.',
        ],
        amenities: [
          { glyph: 'kitchen', label: 'Kitchen with fridge, gas burners and kettle' },
          { glyph: 'bath', label: 'Full bathroom with hot water shower' },
          { glyph: 'bed', label: 'Cotton bed linen and sheep wool blankets' },
          { glyph: 'hammock', label: 'Veranda with hammock and a table for breakfast outside' },
          { glyph: 'lavender', label: 'Lavender from the farm, cut the day you arrive' },
          { glyph: 'mirador', label: 'Ten minute walk to the lookout point' },
        ],
        highlights: [
          {
            glyph: 'stove',
            label: 'Wood fired clay stove',
            note: 'Built by hand from the same earth as the walls. Three logs carry it through the night.',
          },
          {
            glyph: 'solar',
            label: 'Its own solar power',
            note: 'Panels and batteries in the shed. The house has never been connected to the grid.',
          },
          {
            glyph: 'rain',
            label: 'Rainwater harvesting',
            note: 'The thatch feeds a thousand litre tank that supplies the vegetable beds and the shower.',
          },
          {
            glyph: 'hive',
            label: 'Hives on the veranda',
            note: 'Two boxes at the edge of the deck. You can look closely, with a borrowed veil and a calm hand.',
          },
        ],
        images: [],
        bookNote:
          'The house is finished and lived in, so it opens to guests on selected dates. Write to us before booking and we will sort out the dates together.',
      },
    },
  },
  {
    id: 'casa-2',
    status: 'enObra',
    // DEMO-WERTE
    facts: { beds: 3, guests: 4, area: 60, bedrooms: 2, bathrooms: 1 },
    airbnbUrl: 'https://www.airbnb.com/',
    text: {
      es: {
        title: 'Casa de Barro 2',
        tagline: 'La casa que estamos levantando pensando en vos.',
        body: [
          'La segunda casa nace para huéspedes. Cincuenta metros cuadrados, un dormitorio abierto con una cama doble y un sofá cama en el living. El mismo barro del terreno, incluso aislando el techo, pero con la galería girada hacia el tajamar, para que el sol nos despierte al amanecer. Está a la izquierda del anillo central, entre los frutales, el futuro campo de pistachos y lavandas.',
          'Un ojo de buey justo enfrente de la cama deja que el sol te haga cosquillas a la mañana.',
          'Del otro lado, entre los árboles nativos del vecino, va el hot tub de agua caliente a leña. De noche no hay una sola luz alrededor en kilómetros: se ve la Vía Láctea completa, y desde el agua se escuchan las ranas del tajamar.',
        ],
        amenities: [
          { glyph: 'kitchen', label: 'Cocina abierta con mesada de barro pulido y horno a leña' },
          { glyph: 'bath', label: 'Baño con ducha y lavatorio de piedra del arroyo' },
          { glyph: 'bed', label: 'Dos dormitorios: una cama matrimonial y dos simples' },
          { glyph: 'hammock', label: 'Galería larga con dos hamacas y vista al tajamar' },
          { glyph: 'lavender', label: 'Hileras de lavanda a diez pasos de la puerta' },
          { glyph: 'clay', label: 'Paredes de barro del terreno, levantadas en los talleres' },
        ],
        highlights: [
          {
            glyph: 'tub',
            label: 'Hot tub a leña bajo las estrellas',
            note: 'Tina de madera calentada con leña, entre los árboles nativos del vecino. Tarda dos horas en llegar a temperatura y vale cada minuto.',
          },
          {
            glyph: 'stars',
            label: 'Ventana al cielo sobre la cama',
            note: 'Una claraboya en el dormitorio grande, justo encima de la almohada. Sin cortina, a propósito.',
          },
          {
            glyph: 'solar',
            label: 'Energía solar y agua de lluvia',
            note: 'Como la casa 1: paneles propios y dos tanques que juntan lo que cae sobre el quincho.',
          },
        ],
        images: [],
        bookNote:
          'La obra sigue en marcha. El anuncio propio en Airbnb se publica cuando esté el techo entero; por ahora el botón te lleva a Airbnb y todavía no hay fechas cargadas.',
      },
      en: {
        title: 'Clay House 2',
        tagline: 'The house we are raising with guests in mind.',
        body: [
          'The second house was built for guests. Fifty square metres, one open bedroom with a double bed and a sofa bed in the living room. The same clay from the land, even insulating the roof, but with the gallery turned toward the pond, so the sun wakes you at dawn. It sits to the left of the central ring, between the fruit trees, the future pistachio field and the lavender.',
          'A round window right above the bed lets the sun tickle you awake in the morning.',
          'On the other side, among the neighbour\'s native trees, sits the wood-fired hot tub. At night there is not one artificial light for kilometres: you get the full Milky Way, and from the water you hear the frogs down at the pond.',
        ],
        amenities: [
          { glyph: 'kitchen', label: 'Open kitchen with a polished clay counter and wood oven' },
          { glyph: 'bath', label: 'Bathroom with shower and a basin cut from creek stone' },
          { glyph: 'bed', label: 'Two bedrooms: one double bed and two singles' },
          { glyph: 'hammock', label: 'Long veranda with two hammocks facing the pond' },
          { glyph: 'lavender', label: 'Lavender rows ten steps from the door' },
          { glyph: 'clay', label: 'Walls of clay from the land, raised during the workshops' },
        ],
        highlights: [
          {
            glyph: 'tub',
            label: 'Wood fired hot tub under the stars',
            note: 'A wooden tub heated by fire, tucked among the neighbour\'s native trees. It takes two hours to come up to temperature and is worth every minute.',
          },
          {
            glyph: 'stars',
            label: 'A window to the sky above the bed',
            note: 'A skylight in the large bedroom, right over the pillow. No curtain, on purpose.',
          },
          {
            glyph: 'solar',
            label: 'Solar power and rainwater',
            note: 'Same as house 1: its own panels, plus two tanks collecting whatever falls on the thatch.',
          },
        ],
        images: [],
        bookNote:
          'The build is still under way. Our own Airbnb listing goes live once the roof is fully thatched; for now the button opens Airbnb and no dates are loaded yet.',
      },
    },
  },
  {
    id: 'casa-3',
    status: 'planeado',
    // DEMO-WERTE, Planzahlen aus dem Entwurf
    facts: { beds: 4, guests: 6, area: 75, bedrooms: 2, bathrooms: 2 },
    // Kein airbnbUrl: Haus existiert nur auf dem Papier.
    // Der Dialog zeigt stattdessen den Hinweis plus Link auf #contacto.
    text: {
      es: {
        title: 'Casa de Barro 3',
        tagline: 'Todavía en el papel, sobre el tramo sur del anillo.',
        body: [
          'La tercera casa existe por ahora en un plano dibujado a mano que vive sobre la mesa de la cocina, con manchas de mate y correcciones a lápiz. Va sobre el tramo sur, a cien metros del mirador, mirando hacia donde el terreno baja y se abre.',
          'Es la más grande de las tres: dos dormitorios, un altillo para chicos y una galería en L que sigue el sol desde el desayuno hasta la última luz. La idea es que sea la casa donde se juntan las tres familias del proyecto cuando hay algo que festejar.',
          'Se va a levantar como las otras, con barro del mismo tramo sur y paja de la chacra, en jornadas de taller. Si el clima acompaña, las primeras paredes se levantan la próxima primavera. Los números de abajo son del anteproyecto y todavía pueden cambiar.',
        ],
        amenities: [
          { glyph: 'bed', label: 'Dos dormitorios más un altillo con dos camas para chicos' },
          { glyph: 'kitchen', label: 'Cocina grande con horno de barro para pan' },
          { glyph: 'bath', label: 'Dos baños, uno de ellos con ducha exterior' },
          { glyph: 'hammock', label: 'Galería en L orientada al norte y al poniente' },
          { glyph: 'clay', label: 'Barro del tramo sur y paja de la propia chacra' },
        ],
        highlights: [
          {
            glyph: 'clay',
            label: 'Se levanta en los talleres',
            note: 'Cada jornada del taller de barro suma una hilada. La casa es, literalmente, obra de quienes vinieron a visitar.',
          },
          {
            glyph: 'stars',
            label: 'Claraboya sobre la escalera',
            note: 'Una abertura de vidrio en el punto más alto del quincho para que la luz baje hasta el piso de abajo.',
          },
          {
            glyph: 'rain',
            label: 'Dos tanques de agua de lluvia',
            note: 'El doble de superficie de techo que la casa 1, así que el doble de agua guardada para el verano seco.',
          },
          {
            glyph: 'mirador',
            label: 'A cien metros del mirador',
            note: 'La única casa desde la que se ve el panorama entero sin salir de la galería.',
          },
        ],
        images: [],
        bookNote:
          'Todavía es un plano: no hay nada que reservar. Si querés seguir la obra, apuntarte a un taller de barro o preguntar por fechas futuras, escribinos.',
      },
      en: {
        title: 'Clay House 3',
        tagline: 'Still on paper, out on the southern stretch of the ring.',
        body: [
          'The third house exists for now as a hand drawn plan that lives on the kitchen table, complete with mate stains and pencil corrections. It goes on the southern stretch, a hundred metres from the lookout, facing the side where the land drops away and opens up.',
          'It is the largest of the three: two bedrooms, a loft for kids and an L shaped veranda that follows the sun from breakfast to the last light. The idea is that this becomes the house where the three families of the project gather whenever there is something to celebrate.',
          'It will go up like the others, with clay from that same southern stretch and straw from the farm, over workshop days. If the weather plays along, the first walls rise next spring. The figures below come from the draft design and may still change.',
        ],
        amenities: [
          { glyph: 'bed', label: 'Two bedrooms plus a loft with two beds for kids' },
          { glyph: 'kitchen', label: 'Large kitchen with a clay bread oven' },
          { glyph: 'bath', label: 'Two bathrooms, one of them with an outdoor shower' },
          { glyph: 'hammock', label: 'L shaped veranda facing north and west' },
          { glyph: 'clay', label: 'Clay from the southern stretch and straw from the farm' },
        ],
        highlights: [
          {
            glyph: 'clay',
            label: 'Raised during the workshops',
            note: 'Every clay workshop day adds another course of wall. The house is quite literally built by the people who came to visit.',
          },
          {
            glyph: 'stars',
            label: 'Skylight above the stairs',
            note: 'A glass opening at the highest point of the thatch so daylight reaches all the way down to the ground floor.',
          },
          {
            glyph: 'rain',
            label: 'Two rainwater tanks',
            note: 'Twice the roof area of house 1, so twice the water stored for the dry end of summer.',
          },
          {
            glyph: 'mirador',
            label: 'A hundred metres from the lookout',
            note: 'The only house where you get the full panorama without leaving the veranda.',
          },
        ],
        images: [],
        bookNote:
          'It is still a drawing, so there is nothing to book. If you want to follow the build, join a clay workshop or ask about future dates, write to us.',
      },
    },
  },
];

export interface CasaUI {
  open: string;
  close: string;
  gallery: string;
  prev: string;
  next: string;
  /** Platzhalter {n} und {total} */
  slideLabel: string;
  /** Platzhalter {n} */
  goToSlide: string;
  factsTitle: string;
  beds: string;
  guests: string;
  area: string;
  areaUnit: string;
  bedroom: string;
  bedrooms: string;
  bathroom: string;
  bathrooms: string;
  plannedPrefix: string;
  amenities: string;
  highlights: string;
  bookAirbnb: string;
  newTab: string;
  notBookable: string;
  askUs: string;
  demoNote: string;
}

/**
 * UI-Beschriftungen des Dialogs.
 * Bewusst hier und nicht in src/i18n: der Dialog gehört zu diesem Datensatz.
 */
export const casaUI: Record<Lang, CasaUI> = {
  es: {
    open: 'Ver la casa',
    close: 'Cerrar',
    gallery: 'Galería de la casa',
    prev: 'Imagen anterior',
    next: 'Imagen siguiente',
    slideLabel: 'Imagen {n} de {total}',
    goToSlide: 'Ir a la imagen {n}',
    factsTitle: 'En números',
    beds: 'Camas',
    guests: 'Huéspedes',
    area: 'Superficie',
    areaUnit: 'm²',
    bedroom: 'Dormitorio',
    bedrooms: 'Dormitorios',
    bathroom: 'Baño',
    bathrooms: 'Baños',
    plannedPrefix: 'Valores previstos',
    amenities: 'Equipamiento',
    highlights: 'Lo que la hace especial',
    bookAirbnb: 'Reservar en Airbnb',
    newTab: 'se abre en una pestaña nueva',
    notBookable: 'Todavía no se puede reservar',
    askUs: 'Escribinos por esta casa',
    demoNote: 'Los datos de equipamiento son de ejemplo.',
  },
  en: {
    open: 'See the house',
    close: 'Close',
    gallery: 'House gallery',
    prev: 'Previous image',
    next: 'Next image',
    slideLabel: 'Image {n} of {total}',
    goToSlide: 'Go to image {n}',
    factsTitle: 'In numbers',
    beds: 'Beds',
    guests: 'Guests',
    area: 'Floor area',
    areaUnit: 'm²',
    bedroom: 'Bedroom',
    bedrooms: 'Bedrooms',
    bathroom: 'Bathroom',
    bathrooms: 'Bathrooms',
    plannedPrefix: 'Planned figures',
    amenities: 'What is inside',
    highlights: 'What makes it special',
    bookAirbnb: 'Book on Airbnb',
    newTab: 'opens in a new tab',
    notBookable: 'Not bookable yet',
    askUs: 'Write to us about this house',
    demoNote: 'Amenity details are sample content.',
  },
};

/** Winziger Platzhalter-Ersetzer für die Galerie-Labels. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
