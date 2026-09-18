/**
 * Anfragen absenden — die Client-Seite von supabase/migrations/005_solicitudes.sql.
 *
 * Diese Datei ist der Gegenpol zu fetch-workshops.ts: dort wird zur BAUZEIT
 * gelesen, hier wird zur LAUFZEIT im Browser geschrieben. Es ist die erste
 * Stelle im Projekt, an der die Website etwas in die Datenbank schreibt
 * (Befund B3 des Anpassungsplans: bis hierher war jedes Formular eine
 * Attrappe).
 *
 * ---------------------------------------------------------------------
 * Warum der Supabase-Client hier erst beim Absenden geladen wird
 * ---------------------------------------------------------------------
 * src/lib/supabase.ts wirft beim Laden des Moduls, wenn PUBLIC_SUPABASE_URL
 * oder PUBLIC_SUPABASE_ANON_KEY fehlen. Das ist für den Build genau richtig
 * -- eine Website ohne Inhalte soll nicht stillschweigend entstehen.
 *
 * Für ein Formular wäre es falsch: läge der Import oben, würde beim
 * Seitenaufruf ohne gesetzte Variablen bereits das ganze Skript sterben,
 * und mit ihm Modulauswahl, Altersfilter und Schrittwechsel -- der Bereich
 * wäre kaputt, obwohl nur das Absenden betroffen ist. Deshalb ein
 * dynamisches `import()` INNERHALB der Funktion: die Seite baut und läuft
 * ohne Zugangsdaten vollständig, nur der letzte Knopfdruck meldet dann
 * ehrlich einen Fehler.
 *
 * ---------------------------------------------------------------------
 * Warum ohne .select()
 * ---------------------------------------------------------------------
 * Die Rolle `anon` hat auf public.solicitudes ausschliesslich INSERT und
 * bewusst kein SELECT (siehe Migration, Abschnitt 3). supabase-js schickt
 * ohne angehängtes .select() den Header `Prefer: return=minimal`, PostgREST
 * liest die Zeile dann gar nicht zurück. Wer hier ein .select() ergänzt,
 * bekommt einen Rechtefehler bei einem Einfügen, das in Wahrheit
 * funktioniert hat -- und würde vermutlich als "Lösung" das SELECT-Recht
 * vergeben. Das wäre der Punkt, an dem jeder Besucher alle Anfragen aller
 * Schulen lesen könnte. Nicht tun.
 */

/** Woher die Anfrage stammt. Beide Herkünfte sind in Benutzung. */
export type SolicitudOrigen = 'escuelas' | 'on_tour';

/**
 * Was ein Formular sammelt.
 *
 * ---------------------------------------------------------------------
 * Zwei Herkünfte, ein Tisch, getrennte Felder
 * ---------------------------------------------------------------------
 * Schulanfragen und On-Tour-Anfragen landen in derselben Tabelle, füllen
 * darin aber verschiedene Spalten. Das war kurzzeitig anders gelöst: On
 * Tour hat seine Angaben auf die Schulspalten abgebildet, die
 * Anfahrtszone lag also in einer Spalte namens `clase`. Wer die Anfragen
 * später im Backend ansieht, liest dann einen Zonennamen unter der
 * Überschrift "Klasse" -- eine Falle, die sich nicht von selbst erklärt.
 * Seit Migration 008 hat jede Herkunft ihre eigenen Spalten, und eine
 * Prüfregel in der Datenbank verlangt sie auch.
 *
 * Gemeinsam bleibt nur der Kontaktblock: `docente`, `mail`, `telefono`.
 * `docente` heisst so, weil es bei den Schulen zuerst gebraucht wurde;
 * gemeint ist die anfragende Person, bei On Tour also niemand, der
 * unterrichtet. Der Name bleibt, weil ein Umbenennen die Spalte,
 * die Prüfregel und beide Formulare anfasst -- und die Datenbank sagt es
 * über `comment on column` ohnehin dazu.
 *
 * DATENSPARSAMKEIT: von den Kindern wird ausschliesslich die ANZAHL
 * erhoben (`alumnos`) und der Jahrgang (`clase`). Keine Namen, keine
 * Geburtsdaten, keine Fotos. Wer dieses Interface erweitern will, lese
 * zuerst den Kopf der Migration 005.
 */
export interface SolicitudEntrada {
  origen: SolicitudOrigen;
  /** Stabile IDs der gewählten Module bzw. Seminare, mindestens eine. */
  modulos: string[];
  /** ISO-Datum (YYYY-MM-DD) aus dem <input type="date">. */
  fecha1: string;
  fecha2?: string;

  /* --- nur bei origen === 'escuelas' --- */
  alumnos?: number;
  clase?: string;
  escuela?: string;

  /* --- nur bei origen === 'on_tour' --- */
  personas?: number;
  /** Kennung der Anfahrtszone, entspricht `Zona.id` in src/data/on-tour.ts. */
  zona?: string;
  organizacion?: string;
  lugar?: string;

  /* --- immer --- */
  /** Die anfragende Person. Bei Schulen die Lehrkraft, siehe oben. */
  docente: string;
  mail: string;
  telefono?: string;
  nota?: string;
  /** Muss true sein -- sonst wird gar nicht erst gesendet. */
  consentimiento: boolean;
  /**
   * Der Satz neben dem Häkchen, WORTWÖRTLICH und in der Sprache, in der die
   * Person ihn gesehen hat. Nachweis der Einwilligung nach Art. 9 der Ley
   * 18.331. Nicht zusammenfassen, nicht kürzen, nicht durch einen Schlüssel
   * ersetzen -- ein Schlüssel zeigt auf einen Text, den wir morgen ändern
   * können, und beweist damit nichts.
   */
  consentimientoTexto: string;
}

/** Warum die Anfrage nicht ankam. */
export type SolicitudMotivo = 'sin-consentimiento' | 'sin-conexion' | 'rechazado';

/**
 * Bewusst ein flaches Objekt mit optionalen Feldern und KEINE
 * unterschiedene Union ({ok:true} | {ok:false, motivo}). Die wäre
 * sauberer, funktioniert aber in diesem Projekt nicht: tsconfig.json erbt
 * von astro/tsconfigs/base, dort ist `strict` aus, und ohne
 * strictNullChecks verengt TypeScript eine Union nicht anhand eines
 * booleschen Unterscheidungsmerkmals. Der Aufrufer bekäme dann im
 * Fehlerzweig "Property 'motivo' does not exist" -- ein Fehler, der nur
 * vom Compiler kommt und nicht vom Code.
 */
export interface SolicitudResultado {
  ok: boolean;
  /** Nur gesetzt, wenn ok === false. */
  motivo?: SolicitudMotivo;
  /** Technische Meldung für die Entwicklerkonsole, nie für die Seite. */
  detalle?: string;
}

/** Leere Zeichenketten sollen als NULL in der Datenbank landen, nicht als ''. */
function limpio(valor: string | undefined): string | null {
  const v = (valor ?? '').trim();
  return v === '' ? null : v;
}

/**
 * Schreibt eine Anfrage nach public.solicitudes.
 *
 * Wirft nie -- das Formular soll bei einem Fehler stehen bleiben, ausgefüllt
 * und erneut absendbar, nicht in einer nicht abgefangenen Ausnahme
 * verschwinden. Der Rückgabewert unterscheidet drei Fälle, weil sie für die
 * Besucherin drei verschiedene Sätze bedeuten:
 *
 *   sin-consentimiento  unser eigener Fehler im Ablauf (Häkchen nicht
 *                       geprüft) -- darf gar nicht vorkommen.
 *   sin-conexion        Supabase ist nicht erreichbar oder gar nicht
 *                       konfiguriert. Hier hilft nur "später nochmal" oder
 *                       der Weg über die Kontaktdaten.
 *   rechazado           Die Datenbank hat abgelehnt (Prüfregel, Policy).
 */
export async function enviarSolicitud(datos: SolicitudEntrada): Promise<SolicitudResultado> {
  // Gürtel und Hosenträger: dieselbe Bedingung steht als Spalten-Check und
  // als RLS-Policy in der Datenbank. Hier steht sie ein drittes Mal, damit
  // ohne Einwilligung nicht einmal eine Anfrage das Gerät verlässt.
  if (!datos.consentimiento || limpio(datos.consentimientoTexto) === null) {
    return { ok: false, motivo: 'sin-consentimiento' };
  }

  let supabase: typeof import('./supabase')['supabase'];
  try {
    ({ supabase } = await import('./supabase'));
  } catch (err) {
    return {
      ok: false,
      motivo: 'sin-conexion',
      detalle: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const esEscuela = datos.origen === 'escuelas';

    /*
     * Nur die Felder der eigenen Herkunft schicken, die der anderen als
     * NULL. Die Prüfregel `solicitudes_origen_campos_check` aus Migration
     * 008 verlangt genau das -- und sie ist der Grund, warum hier nicht
     * einfach alles mitgeschickt wird, was zufällig gesetzt ist.
     */
    const { error } = await supabase.from('solicitudes').insert({
      origen: datos.origen,
      modulos: datos.modulos,
      fecha_1: datos.fecha1,
      fecha_2: limpio(datos.fecha2),

      alumnos: esEscuela ? (datos.alumnos ?? null) : null,
      clase: esEscuela ? limpio(datos.clase) : null,
      escuela: esEscuela ? limpio(datos.escuela) : null,

      personas: esEscuela ? null : (datos.personas ?? null),
      zona: esEscuela ? null : limpio(datos.zona),
      organizacion: esEscuela ? null : limpio(datos.organizacion),
      lugar: esEscuela ? null : limpio(datos.lugar),

      docente: datos.docente.trim(),
      mail: datos.mail.trim(),
      telefono: limpio(datos.telefono),
      nota: limpio(datos.nota),
      consentimiento: true,
      consentimiento_texto: datos.consentimientoTexto.trim(),
      // creado_en, consentimiento_en und estado setzt der Trigger
      // solicitudes_sellar() serverseitig -- ein Zeitstempel aus einem
      // fremden Browser taugt nicht als Nachweis.
    });

    if (error) {
      return { ok: false, motivo: 'rechazado', detalle: error.message };
    }
    return { ok: true };
  } catch (err) {
    // Netzwerkabbruch, Zeitüberschreitung, Offline.
    return {
      ok: false,
      motivo: 'sin-conexion',
      detalle: err instanceof Error ? err.message : String(err),
    };
  }
}
