/**
 * Supabase-/PostgREST-Fehler in ruhige spanische Sätze übersetzen.
 *
 * Der Bestand hat rohe englische Fehlermeldungen in eine spanische Oberfläche
 * geschrieben (P6). Hier steht stattdessen eine Tabelle bekannter Fälle:
 * jeder Satz sagt, was passiert ist, und schlägt genau eine Handlung vor.
 * Unbekanntes bekommt einen freundlichen Satz plus `detail` — den Text für
 * das ausklappbare technische Detail.
 *
 * Der Fehler wird bewusst nur gelesen, nie umgebaut: die Aufrufer geben
 * `unknown` weiter, damit auch geworfene Strings oder abgebrochene Fetches
 * hier landen können.
 */

export interface HumanError {
  message: string;
  /** Technischer Wortlaut für "Ver detalle" — nie ungefragt anzeigen. */
  detail?: string;
}

/** Kennung für "Die Nutzerin hat den Reauth-Dialog abgebrochen". */
export const SESSION_CANCELLED = 'adm/session-cancelled';

export function sessionCancelledError(): Error {
  return new Error(SESSION_CANCELLED);
}

export function isSessionCancelled(err: unknown): boolean {
  return read(err).message === SESSION_CANCELLED;
}

interface RawError {
  code: string;
  message: string;
  details: string;
  hint: string;
  status: number;
  name: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function read(err: unknown): RawError {
  if (typeof err === 'string') {
    return { code: '', message: err, details: '', hint: '', status: 0, name: '' };
  }
  if (typeof err !== 'object' || err === null) {
    return { code: '', message: '', details: '', hint: '', status: 0, name: '' };
  }
  const o = err as Record<string, unknown>;
  const statusRaw = o.status ?? o.statusCode;
  return {
    code: str(o.code) || str(o.error),
    message: str(o.message) || str(o.error_description) || str(o.msg),
    details: str(o.details),
    hint: str(o.hint),
    status: typeof statusRaw === 'number' ? statusRaw : Number(str(statusRaw)) || 0,
    name: str(o.name),
  };
}

interface Rule {
  when: (e: RawError) => boolean;
  message: string;
}

const has = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Reihenfolge zählt: die spezifischeren Regeln stehen oben. Der erste
 * Treffer gewinnt.
 */
const RULES: Rule[] = [
  {
    when: (e) => e.message === SESSION_CANCELLED,
    message:
      'No se guardó nada todavía. Para seguir hace falta entrar de nuevo — tu texto sigue acá.',
  },

  // ---- Sitzung / Rechte ----------------------------------------------------
  {
    when: (e) =>
      e.code === 'PGRST301' ||
      has(e.message, 'JWT expired') ||
      has(e.message, 'token is expired') ||
      e.code === 'session_expired',
    message: 'Tu sesión venció. Entrá de nuevo y seguimos donde estabas.',
  },
  {
    when: (e) => e.code === '42501' || has(e.message, 'row-level security') || has(e.message, 'permission denied'),
    message:
      'La base de datos no permitió este cambio. Cerrá sesión, volvé a entrar y probá otra vez.',
  },
  {
    when: (e) => has(e.message, 'Invalid login credentials'),
    message: 'Correo o contraseña incorrectos.',
  },
  {
    when: (e) => has(e.message, 'Email not confirmed'),
    message: 'Falta confirmar ese correo antes de poder entrar.',
  },
  {
    when: (e) => e.status === 429 || has(e.code, 'rate_limit') || has(e.message, 'too many requests'),
    message: 'Fueron muchos intentos seguidos. Esperá un minuto y probá de nuevo.',
  },

  // ---- Datenfehler ---------------------------------------------------------
  {
    when: (e) => e.code === '23505' || has(e.message, 'duplicate key value'),
    message:
      'Ya existe otra entrada con ese enlace. Cambiá el título o el enlace (slug) y guardá otra vez.',
  },
  {
    when: (e) => e.code === '23514' || has(e.message, 'violates check constraint'),
    message:
      'Alguno de los valores no está permitido — por ejemplo un precio negativo o cero lugares. Revisá los números.',
  },
  {
    when: (e) => e.code === '23502' || has(e.message, 'null value in column'),
    message: 'Falta completar un campo obligatorio antes de guardar.',
  },
  {
    when: (e) => e.code === '23503' || has(e.message, 'violates foreign key'),
    message:
      'Esa entrada ya no existe o cambió mientras trabajabas. Actualizá la página y volvé a probar.',
  },
  {
    when: (e) => e.code === '22P02' || has(e.message, 'invalid input syntax'),
    message: 'Alguno de los datos no tiene el formato esperado. Revisá las fechas y los números.',
  },
  {
    when: (e) => e.code === 'PGRST116' || e.code === 'P0002' || has(e.message, 'no rows'),
    message: 'No se encontró esa entrada. Puede que ya no exista; actualizá la página.',
  },

  // ---- Datenbank noch nicht eingerichtet ------------------------------------
  {
    when: (e) => e.code === 'PGRST202' || has(e.message, 'function public.') || has(e.message, 'could not find the function'),
    message:
      'Falta una función en la base de datos. Hay que correr la migración de supabase/ antes de usar esto.',
  },
  {
    when: (e) =>
      e.code === 'PGRST205' ||
      e.code === '42P01' ||
      has(e.message, 'does not exist') ||
      has(e.message, 'schema cache'),
    message:
      'Falta una tabla en la base de datos. Hay que correr supabase/schema.sql antes de usar esto.',
  },

  // ---- Speicher / Dateien --------------------------------------------------
  {
    when: (e) =>
      e.status === 413 ||
      has(e.message, 'maximum allowed size') ||
      has(e.message, 'payload too large') ||
      has(e.message, 'entity too large'),
    message: 'Esa foto pesa demasiado. Probá con una más chica o sacale resolución.',
  },
  {
    when: (e) => has(e.message, 'quota') || has(e.message, 'storage limit') || has(e.message, 'exceeded'),
    message:
      'Se llenó el espacio de fotos del proyecto. Borrá fotos que ya no uses o pedí más espacio.',
  },
  {
    when: (e) => e.status === 409 || has(e.message, 'resource already exists') || has(e.message, 'duplicate'),
    message: 'Ya hay un archivo con ese nombre. Volvé a subir la foto y se le pone otro.',
  },
  {
    when: (e) => has(e.message, 'mime type') || has(e.message, 'invalid file'),
    message: 'Ese archivo no es una imagen que podamos usar. Probá con un JPG o un PNG.',
  },

  // ---- Netz ----------------------------------------------------------------
  {
    when: (e) =>
      has(e.message, 'failed to fetch') ||
      has(e.message, 'networkerror') ||
      has(e.message, 'load failed') ||
      has(e.message, 'network request failed') ||
      e.name === 'AbortError' ||
      e.name === 'TimeoutError',
    message:
      'No hay conexión con el servidor. Revisá internet y probá de nuevo — lo que escribiste no se pierde.',
  },
  {
    when: (e) => e.status >= 500,
    message: 'El servidor no está respondiendo bien. Esperá un momento y probá de nuevo.',
  },
];

const FALLBACK = 'Algo no salió bien. Probá de nuevo; si vuelve a pasar, avisale a Maxi.';

export function humanError(err: unknown): HumanError {
  const e = read(err);
  const detail = [
    e.code && `código: ${e.code}`,
    e.status && `estado: ${e.status}`,
    e.message,
    e.details,
    e.hint && `sugerencia: ${e.hint}`,
  ]
    .filter(Boolean)
    .join(' · ');

  for (const rule of RULES) {
    if (rule.when(e)) {
      return detail ? { message: rule.message, detail } : { message: rule.message };
    }
  }
  return { message: FALLBACK, detail: detail || String(err) };
}
