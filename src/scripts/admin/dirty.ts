/**
 * Dirty-Tracking, Autosave-Debounce und Verlassen-Schutz (P3).
 *
 * Jede Eingabe meldet `markDirty()`. 1,2 s nach der letzten Eingabe läuft
 * `save()` still — das schreibt nur den Entwurfsstand, nie den öffentlichen
 * (siehe supabase/schema.sql: die Website liest `published_payload`).
 *
 * Zustände, die die Kopfzeile anzeigt:
 *   clean   Guardado
 *   dirty   Sin guardar
 *   saving  Guardando…
 *   error   No se pudo guardar
 *
 * Solange nicht `clean`, hängt ein `beforeunload` daran. Der Browser zeigt
 * dann seinen eigenen Warntext; einen eigenen Satz lässt er nicht zu.
 *
 * Zusätzlich spiegelt `mirrorDraft()` den Formularstand in `sessionStorage`
 * (Spec 2.5). Das ist die Rückversicherung für den Fall, dass Tab oder Handy
 * mitten im Tippen weggeräumt werden.
 */

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error';

export interface AutoSaver {
  markDirty(): void;
  flush(): Promise<void>;
  state(): SaveState;
  destroy(): void;
}

export interface AutoSaverOptions {
  save: () => Promise<void>;
  onState: (s: SaveState, at?: Date) => void;
  /** Wartezeit nach der letzten Eingabe. Vorgabe 1200 ms. */
  delay?: number;
}

export function createAutoSaver(o: AutoSaverOptions): AutoSaver {
  const delay = o.delay ?? 1200;

  let state: SaveState = 'clean';
  let timer = 0;
  /** Läuft gerade ein Speicherlauf? (Fehler bereits geschluckt.) */
  let saving: Promise<void> | null = null;
  /** Es gibt Änderungen, die noch nicht geschrieben sind. */
  let pending = false;
  let destroyed = false;

  function setState(next: SaveState, at?: Date): void {
    state = next;
    o.onState(next, at);
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (state === 'clean') return;
    event.preventDefault();
    // Ältere Browser brauchen den Rückgabewert; den Text setzen sie selbst.
    event.returnValue = '';
  }

  window.addEventListener('beforeunload', onBeforeUnload);

  function clearTimer(): void {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  }

  /**
   * Speichert, bis nichts mehr offen ist. Die Schleife fängt Eingaben ab,
   * die während eines laufenden Schreibvorgangs dazukommen — sonst bliebe
   * der letzte Tastendruck ungespeichert liegen.
   */
  async function runSave(): Promise<void> {
    if (destroyed) return;
    if (saving) {
      await saving;
      return;
    }
    clearTimer();
    if (!pending) return;

    const cycle = (async () => {
      while (pending && !destroyed) {
        pending = false;
        setState('saving');
        try {
          await o.save();
        } catch (err) {
          if (!destroyed) {
            pending = true;
            setState('error');
          }
          throw err;
        }
        if (destroyed) return;
        if (!pending) setState('clean', new Date());
      }
    })();

    saving = cycle.then(
      () => undefined,
      () => undefined,
    );
    try {
      await cycle;
    } finally {
      saving = null;
    }
  }

  function schedule(): void {
    clearTimer();
    timer = window.setTimeout(() => void runSave().catch(() => undefined), delay);
  }

  return {
    markDirty() {
      if (destroyed) return;
      pending = true;
      if (state !== 'saving') setState('dirty');
      schedule();
    },

    async flush() {
      if (destroyed) return;
      clearTimer();
      if (saving) await saving;
      if (pending) await runSave();
    },

    state() {
      return state;
    },

    destroy() {
      destroyed = true;
      clearTimer();
      window.removeEventListener('beforeunload', onBeforeUnload);
    },
  };
}

// ---------------------------------------------------------------------------
// Spiegel in sessionStorage — überlebt das Wegräumen des Tabs, nicht aber das
// Schließen des Fensters. Bewusst sessionStorage: ein alter Stand in einem
// anderen Tab wäre schlimmer als gar keiner.
// ---------------------------------------------------------------------------

const MIRROR_PREFIX = 'adm:draft:';

export function mirrorDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
  } catch {
    // Voller oder gesperrter Speicher: der Spiegel ist Zusatz, kein Muss.
  }
}

export function readMirroredDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(MIRROR_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearMirroredDraft(key: string): void {
  try {
    sessionStorage.removeItem(MIRROR_PREFIX + key);
  } catch {
    // s. o.
  }
}
