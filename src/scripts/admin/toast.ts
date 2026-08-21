/**
 * Toasts — die kurze Rückmeldung nach jeder Aktion, unten am Bildschirm.
 *
 * Ersetzt `status.ts`: dessen Meldung stand fest oben im Dashboard und war
 * vom Formular verdeckt, sodass Speichern-Feedback unsichtbar blieb (P6).
 * Der Behälter hängt direkt an <body>, damit kein Editor-Layout ihn
 * beschneiden kann, und liegt über allem.
 *
 * Rückgängig (P7): `undo` zeigt einen "Deshacer"-Knopf. Solange der Toast
 * steht, ist die Aktion zurücknehmbar — deshalb ist die Standzeit mit undo
 * länger.
 *
 * Optik: src/styles/admin/base.css, Klassen `.adm-toasts` / `.adm-toast…`.
 */

export type ToastTone = 'ok' | 'error' | 'info';

export interface ToastOptions {
  tone?: ToastTone;
  /** Zeigt "Deshacer"; die Funktion läuft beim Klick. */
  undo?: () => Promise<void> | void;
  /** Standzeit in ms. Vorgabe 4000, mit `undo` 6000. */
  duration?: number;
}

/** Mehr als drei gleichzeitig liest niemand — die ältesten weichen. */
const MAX_VISIBLE = 3;
const LEAVE_MS = 360;

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (host && host.isConnected) return host;
  const el = document.createElement('div');
  el.className = 'adm-toasts';
  // Der Behälter ist die Live-Region; Fehler bekommen zusätzlich role="alert".
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'false');
  document.body.append(el);
  host = el;
  return el;
}

function close(el: HTMLElement): void {
  if (!el.isConnected || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  const done = () => el.remove();
  el.addEventListener('transitionend', done, { once: true });
  window.setTimeout(done, LEAVE_MS);
}

export function toast(msg: string, opts: ToastOptions = {}): void {
  const tone: ToastTone = opts.tone ?? 'info';
  const duration = opts.duration ?? (opts.undo ? 6000 : 4000);
  const box = ensureHost();

  while (box.children.length >= MAX_VISIBLE) {
    const oldest = box.firstElementChild;
    if (!(oldest instanceof HTMLElement)) break;
    oldest.remove();
  }

  const el = document.createElement('div');
  el.className = `adm-toast adm-toast--${tone}`;
  if (tone === 'error') el.setAttribute('role', 'alert');

  const text = document.createElement('p');
  text.className = 'adm-toast__text';
  text.textContent = msg;
  el.append(text);

  let timer = 0;
  const stop = (): void => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };
  const start = (): void => {
    stop();
    timer = window.setTimeout(() => close(el), duration);
  };

  const undo = opts.undo;
  if (undo) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'adm-toast__undo';
    undoBtn.textContent = 'Deshacer';
    undoBtn.addEventListener('click', () => {
      stop();
      undoBtn.disabled = true;
      close(el);
      void (async () => {
        try {
          await undo();
        } catch {
          toast('No se pudo deshacer. Actualizá la página y fijate cómo quedó.', {
            tone: 'error',
          });
        }
      })();
    });
    el.append(undoBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'adm-toast__close';
  closeBtn.setAttribute('aria-label', 'Cerrar aviso');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    stop();
    close(el);
  });
  el.append(closeBtn);

  // Wer hinschaut oder tabbt, bekommt Zeit.
  el.addEventListener('pointerenter', stop);
  el.addEventListener('focusin', stop);
  el.addEventListener('pointerleave', start);
  el.addEventListener('focusout', start);

  box.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  start();
}

/** Alle sichtbaren Toasts wegräumen, z. B. beim Ansichtswechsel. */
export function clearToasts(): void {
  if (!host) return;
  for (const child of Array.from(host.children)) {
    if (child instanceof HTMLElement) close(child);
  }
}
