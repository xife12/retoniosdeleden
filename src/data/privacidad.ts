import type { Lang } from '../i18n';

/**
 * Datenschutzerklärung — Inhalt für /es/privacidad und /en/privacy.
 *
 * Warum hier und nicht in src/i18n: Die i18n-Dateien tragen die Texte der
 * Startseite. Dieser Text gehört zu einem eigenen Vorgang (dem
 * Anfrageformular in AbejasEducan.astro und der Tabelle `solicitudes`) und
 * wird zusammen mit ihm geändert — genauso, wie abejasEducanUI in
 * modulos.ts neben den Modulen steht.
 *
 * ---------------------------------------------------------------------
 * Wonach der Text sich richtet
 * ---------------------------------------------------------------------
 * Ley N° 18.331 (Uruguay), "Protección de Datos Personales y Acción de
 * Habeas Data", samt Decreto 414/009. Die Pflichtangaben, die hier
 * abgedeckt sein müssen:
 *
 *   Art. 13    Auskunftsrecht
 *   Art. 14    Berichtigung, Aktualisierung, Einbeziehung
 *   Art. 15    Löschung ("supresión")
 *   Art.  8    Zweckbindung
 *   Art.  9    Einwilligung: vorher, ausdrücklich, informiert
 *   Art. 29    Anmeldung der Datenbank bei der URCDP
 *
 * Der Ton ist bewusst der der übrigen Seite: kurze Sätze, geduzt auf
 * Spanisch (voseo, wie überall sonst), keine Kanzleisprache. Eine
 * Datenschutzerklärung, die niemand liest, erfüllt Art. 9 nicht — dort
 * steht "informiert", nicht "veröffentlicht".
 *
 * ---------------------------------------------------------------------
 * ACHTUNG — PLATZHALTER
 * ---------------------------------------------------------------------
 * `contacto` unten ist eine erfundene Adresse. Im Projekt gibt es bisher
 * nirgends eine echte (Contact.astro ist eine Attrappe ohne Adresse).
 * Vor dem Livegang durch die tatsächliche Mailadresse ersetzen — an einer
 * Datenschutzerklärung ist die Auskunftsadresse der wichtigste Satz.
 */

/** Mailadresse für Auskunft, Berichtigung und Löschung. PLATZHALTER. */
export const contactoDatos = 'hola@retonosdeleden.uy';

/** Aufsichtsbehörde. Fest, kein Platzhalter. */
export const urcdpUrl = 'https://www.gub.uy/unidad-reguladora-control-datos-personales/';

/**
 * Stand der Erklärung. Wird der Text geändert, gehört dieses Datum
 * mitgeändert — sonst behauptet die Seite eine Aktualität, die nicht
 * stimmt.
 */
export const privacidadFecha = '2026-09-01';

export interface PrivacidadSeccion {
  titulo: string;
  /** Absätze. Reiner Text, kein Markup — die Seite setzt die <p> selbst. */
  parrafos: string[];
  /** Optionale Aufzählung unter den Absätzen. */
  lista?: string[];
}

export interface PrivacidadContenido {
  /** Für <title> und die Kopfleiste. */
  titulo: string;
  /** Für <meta name="description">. */
  descripcion: string;
  intro: string;
  fechaLabel: string;
  volver: string;
  secciones: PrivacidadSeccion[];
}

export const privacidad: Record<Lang, PrivacidadContenido> = {
  es: {
    titulo: 'Cómo cuidamos tus datos',
    descripcion:
      'Qué datos pedimos en nuestros formularios, para qué los usamos, cuánto los guardamos y cómo pedir acceso, corrección o borrado. Ley N° 18.331 del Uruguay.',
    intro:
      'Pedimos pocos datos y los usamos para una sola cosa: responderte. Esta página explica cuáles, por cuánto tiempo y cómo pedir que los borremos.',
    fechaLabel: 'Última actualización',
    volver: 'Volver al inicio',
    secciones: [
      {
        titulo: 'Quién es responsable',
        parrafos: [
          'Retoños del Edén, chacra familiar en el sur del Uruguay (Catalina Marzorati y Stefan Strauß). Somos nosotros quienes decidimos qué se guarda y para qué, y quienes respondemos si algo no está bien.',
          `Para cualquier tema de datos personales, escribinos a ${contactoDatos}.`,
        ],
      },
      {
        titulo: 'Qué datos pedimos y para qué',
        parrafos: [
          'En el formulario de "Las abejas educan" pedimos únicamente lo necesario para armarte una propuesta y coordinar la visita:',
        ],
        lista: [
          'de la escuela: el nombre;',
          'de la o el docente que consulta: nombre, correo y, si querés, teléfono;',
          'de la visita: los módulos elegidos, una o dos fechas deseadas, la clase o año y la CANTIDAD de alumnos;',
          'lo que quieras contarnos en el campo libre.',
        ],
      },
      {
        titulo: 'De los chicos, solamente cuántos son',
        parrafos: [
          'No pedimos nombres, ni fechas de nacimiento, ni fotos de los alumnos. Solo la cantidad y el año escolar, porque de eso dependen la duración y el material del módulo.',
          'Es una decisión, no un olvido: los datos que no existen no se pueden perder, filtrar ni usar mal. Si alguna vez necesitáramos más —por ejemplo para publicar fotos de una visita— te lo pediríamos aparte y con el consentimiento que corresponda.',
        ],
      },
      {
        titulo: 'Para qué NO los usamos',
        parrafos: [
          'Los datos de una consulta sirven para responder esa consulta y coordinar esa visita. Nada más.',
          'No mandamos newsletter, no armamos listas de difusión, no los vendemos ni los cedemos a terceros, y no los usamos para ofrecerte otra cosa. Por eso el formulario no tiene ninguna casilla de "quiero recibir novedades": no la necesitamos y no queremos tenerla.',
        ],
      },
      {
        titulo: 'Tu consentimiento',
        parrafos: [
          'Antes de enviar marcás una casilla —que viene vacía— aceptando que guardemos esos datos para responderte. Junto con tu consulta guardamos la fecha y el texto exacto de esa casilla, tal como lo viste en pantalla.',
          'Eso es a favor tuyo: si algún día cambiamos la redacción, tu consulta sigue teniendo el texto que aceptaste vos, no el nuevo.',
        ],
      },
      {
        titulo: 'Cuánto tiempo los guardamos',
        parrafos: [
          'Mientras la consulta esté abierta, y después hasta 24 meses. El plazo es largo a propósito: el año escolar uruguayo va de marzo a diciembre y muchas escuelas retoman la misma consulta al año siguiente.',
          'Pasado ese plazo, la consulta se borra. Y si nos pedís que la borremos antes, la borramos antes.',
        ],
      },
      {
        titulo: 'Quién puede verlos',
        parrafos: [
          'Solamente nosotros dos. Las consultas se guardan en una base de datos (Supabase) a la que el sitio web puede escribir pero no leer: nadie que visite la página puede ver las consultas de otra escuela, ni la propia.',
          'El proveedor de la base guarda los datos por cuenta nuestra y no los usa para otra cosa.',
        ],
      },
      {
        titulo: 'Tus derechos: acceso, corrección y borrado',
        parrafos: [
          'La Ley N° 18.331 te da derecho a saber qué guardamos sobre vos, a que lo corrijamos si está mal y a que lo borremos (acción de habeas data, artículos 13 a 15).',
          `Escribinos a ${contactoDatos} y decinos qué necesitás. No hace falta explicar por qué. Contestamos dentro de los plazos de la ley —cinco días hábiles para el acceso— y el borrado es borrado de verdad: la consulta desaparece de la base, no queda escondida.`,
        ],
      },
      {
        titulo: 'Si no estás conforme',
        parrafos: [
          'Podés reclamar ante la Unidad Reguladora y de Control de Datos Personales (URCDP), el organismo que controla el cumplimiento de la ley en el Uruguay.',
          urcdpUrl,
        ],
      },
      {
        titulo: 'Cookies y estadísticas',
        parrafos: [
          'Este sitio no usa cookies de seguimiento ni herramientas de estadística que te identifiquen. Lo único que se guarda en tu navegador son preferencias de la propia página, y eso no sale de tu equipo.',
        ],
      },
    ],
  },
  en: {
    titulo: 'How we look after your data',
    descripcion:
      'What we ask for in our forms, what we use it for, how long we keep it, and how to request access, correction or deletion. Uruguayan Law No. 18.331.',
    intro:
      'We ask for very little, and we use it for one thing only: to answer you. This page explains what we keep, for how long, and how to have it deleted.',
    fechaLabel: 'Last updated',
    volver: 'Back to the start',
    secciones: [
      {
        titulo: 'Who is responsible',
        parrafos: [
          'Retoños del Edén, a family farm in southern Uruguay (Catalina Marzorati and Stefan Strauß). We are the ones who decide what is stored and why, and the ones who answer if something is wrong.',
          `For anything concerning personal data, write to ${contactoDatos}.`,
        ],
      },
      {
        titulo: 'What we ask for, and why',
        parrafos: [
          'The "Las abejas educan" form asks only for what we need in order to put together a proposal and arrange the visit:',
        ],
        lista: [
          'about the school: its name;',
          'about the teacher asking: name, email and, if you like, a phone number;',
          'about the visit: the modules chosen, one or two preferred dates, the class or year, and the NUMBER of pupils;',
          'whatever you want to tell us in the free-text field.',
        ],
      },
      {
        titulo: 'About the children, only how many',
        parrafos: [
          'We do not ask for pupils’ names, dates of birth or photographs. Only how many there are and which school year, because the length and the material of a module depend on that.',
          'This is a decision, not an oversight: data that does not exist cannot be lost, leaked or misused. If we ever needed more — to publish photographs of a visit, for instance — we would ask separately, with the consent that requires.',
        ],
      },
      {
        titulo: 'What we do NOT use it for',
        parrafos: [
          'The details from an enquiry serve to answer that enquiry and arrange that visit. Nothing else.',
          'We send no newsletter, build no mailing lists, sell or pass nothing on to third parties, and do not use your details to offer you something else. That is why the form has no "keep me posted" box: we do not need one and do not want one.',
        ],
      },
      {
        titulo: 'Your consent',
        parrafos: [
          'Before sending, you tick a box — empty by default — agreeing that we may store these details in order to answer you. Together with your enquiry we store the date and the exact wording of that box as you saw it on screen.',
          'That is in your favour: if we ever reword it, your enquiry keeps the wording you actually agreed to, not the new one.',
        ],
      },
      {
        titulo: 'How long we keep it',
        parrafos: [
          'While the enquiry is open, and for up to 24 months afterwards. The period is deliberately generous: the Uruguayan school year runs from March to December, and many schools return to the same enquiry the following year.',
          'After that, the enquiry is deleted. And if you ask us to delete it sooner, we delete it sooner.',
        ],
      },
      {
        titulo: 'Who can see it',
        parrafos: [
          'Only the two of us. Enquiries are stored in a database (Supabase) that the website can write to but not read from: nobody visiting the page can see another school’s enquiry, or their own.',
          'The database provider stores the data on our behalf and uses it for nothing else.',
        ],
      },
      {
        titulo: 'Your rights: access, correction and deletion',
        parrafos: [
          'Law No. 18.331 gives you the right to know what we hold about you, to have it corrected if it is wrong, and to have it deleted (the habeas data action, articles 13 to 15).',
          `Write to ${contactoDatos} and tell us what you need. You do not have to explain why. We answer within the deadlines set by the law — five working days for access — and deletion means deletion: the enquiry disappears from the database, it is not merely hidden.`,
        ],
      },
      {
        titulo: 'If you are not satisfied',
        parrafos: [
          'You may complain to the Unidad Reguladora y de Control de Datos Personales (URCDP), the authority that supervises compliance with the law in Uruguay.',
          urcdpUrl,
        ],
      },
      {
        titulo: 'Cookies and statistics',
        parrafos: [
          'This site uses no tracking cookies and no analytics tools that identify you. The only things stored in your browser are the page’s own preferences, and they never leave your device.',
        ],
      },
    ],
  },
};

/** Der Pfad je Sprache — an einer Stelle, damit Fußzeile, Formular und
    Sprachumschalter nicht auseinanderlaufen. */
export const privacidadRuta: Record<Lang, string> = {
  es: '/es/privacidad',
  en: '/en/privacy',
};

/** Beschriftung des Links in der Fußzeile. */
export const privacidadEnlace: Record<Lang, string> = {
  es: 'Privacidad',
  en: 'Privacy',
};
