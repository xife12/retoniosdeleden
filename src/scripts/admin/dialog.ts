/**
 * Dialoge: Bestätigung und Wieder-Anmelden.
 *
 * Ersetzt das native `confirm()` aus v1 (P7) und schließt gleich P12 mit:
 * echter Focus-Trap, Esc schließt, der Fokus geht an das auslösende Element
 * zurück, der Rest der Seite wird per `inert` aus der Tastaturreihenfolge
 * genommen.
 *
 * Bei `tone: 'danger'` ist **Abbrechen** die Primäraktion — der sichere Weg
 * ist der auffällige, das Löschen steht daneben und ist bewusst leiser.
 * Deshalb steht "Cancelar" rechts (Primärplatz) und trägt `.btn`.
 *
 * Optik: src/styles/admin/base.css, Klassen `.adm-dialog…`.
 */
import { currentEmail, hasValidSession, reauthenticate, verifyCode } from './auth';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Offene Dialoge; nur der unterste schaltet Seitensperre und `inert`. */
const stack: HTMLElement[] = [];
let inerted: HTMLElement[] = [];
let previousOverflow = '';

function lockPage(overlay: HTMLElement): void {
  if (stack.length > 1) return;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  inerted = [];
  for (const child of Array.from(document.body.children)) {
    if (child === overlay || !(child instanceof HTMLElement)) continue;
    if (child.hasAttribute('inert')) continue;
    child.toggleAttribute('inert', true);
    inerted.push(child);
  }
}

function unlockPage(): void {
  if (stack.length > 0) return;
  document.body.style.overflow = previousOverflow;
  for (const el of inerted) el.removeAttribute('inert');
  inerted = [];
}

export interface DialogParts {
  /** Der Kasten selbst, ohne Hintergrund. */
  dialog: HTMLElement;
  labelledBy: string;
  initialFocus: () => HTMLElement | null;
  closeOnBackdrop: boolean;
}

/**
 * Gemeinsames Gerüst. `build` bekommt `resolve` und darf jederzeit schließen.
 *
 * Exportiert, weil mfa-dialog.ts denselben Focus-Trap, dieselbe Seitensperre
 * und dieselbe Fokus-Rueckgabe braucht -- ein zweites Dialoggeruest daneben
 * waere genau die Art Verdopplung, die beim Umbau P12 verschwunden ist.
 */
export function openDialog(build: (resolve: (value: boolean) => void) => DialogParts): Promise<boolean> {
  return new Promise<boolean>((resolvePromise) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const overlay = document.createElement('div');
    overlay.className = 'adm-dialog-backdrop';

    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      const index = stack.indexOf(overlay);
      if (index >= 0) stack.splice(index, 1);
      overlay.classList.add('is-leaving');
      window.setTimeout(() => overlay.remove(), 200);
      unlockPage();
      if (opener && opener.isConnected) opener.focus();
      resolvePromise(value);
    };

    const parts = build(finish);
    const { dialog } = parts;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', parts.labelledBy);
    overlay.append(dialog);

    function focusables(): HTMLElement[] {
      return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    }

    function onKeydown(event: KeyboardEvent): void {
      if (stack[stack.length - 1] !== overlay) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    if (parts.closeOnBackdrop) {
      overlay.addEventListener('pointerdown', (event) => {
        if (event.target === overlay) finish(false);
      });
    }

    document.body.append(overlay);
    stack.push(overlay);
    lockPage(overlay);
    document.addEventListener('keydown', onKeydown, true);
    requestAnimationFrame(() => {
      overlay.classList.add('is-in');
      parts.initialFocus()?.focus();
    });
  });
}

let seq = 0;

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'normal';
}

export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  const danger = o.tone === 'danger';
  const id = `adm-dlg-${++seq}`;

  return openDialog((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = `adm-dialog${danger ? ' adm-dialog--danger' : ''}`;

    const title = document.createElement('h2');
    title.className = 'adm-dialog__title';
    title.id = id;
    title.textContent = o.title;
    dialog.append(title);

    if (o.body) {
      const body = document.createElement('p');
      body.className = 'adm-dialog__body';
      body.textContent = o.body;
      dialog.append(body);
    }

    const actions = document.createElement('div');
    actions.className = 'adm-dialog__actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = o.confirmLabel;
    confirmBtn.addEventListener('click', () => resolve(true));

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = o.cancelLabel ?? 'Cancelar';
    cancelBtn.addEventListener('click', () => resolve(false));

    // Bei Gefahr steht der sichere Weg rechts und ist der gefüllte Knopf.
    if (danger) {
      confirmBtn.className = 'adm-btn--danger';
      cancelBtn.className = 'btn';
      actions.append(confirmBtn, cancelBtn);
    } else {
      confirmBtn.className = 'btn';
      cancelBtn.className = 'btn btn--ghost';
      actions.append(cancelBtn, confirmBtn);
    }
    dialog.append(actions);

    return {
      dialog,
      labelledBy: id,
      closeOnBackdrop: true,
      initialFocus: () => (danger ? cancelBtn : confirmBtn),
    };
  });
}

/**
 * "Tu sesión expiró" — nicht-zerstörendes Overlay (P13).
 *
 * Prüft zuerst still, ob die Sitzung inzwischen doch wieder gilt; dann
 * erscheint gar kein Dialog. Sonst Passwortfeld; nach Erfolg wiederholt der
 * Aufrufer (store.ts) den anstehenden Schreibvorgang genau einmal.
 * Ein Klick auf den Hintergrund schließt bewusst **nicht** — das würde die
 * wartende Speicherung abbrechen.
 */
export async function reauthDialog(): Promise<boolean> {
  if (await hasValidSession()) return true;
  const id = `adm-dlg-${++seq}`;

  return openDialog((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'adm-dialog adm-dialog--reauth';
    dialog.innerHTML = `
      <h2 class="adm-dialog__title" id="${id}">Tu sesión expiró</h2>
      <p class="adm-dialog__body">Entrá de nuevo y seguimos donde estabas. No se pierde nada de lo que escribiste.</p>
      <form class="adm-dialog__form" novalidate>
        <div class="adm-field" data-reauth-step="password">
          <label class="adm-label" for="${id}-email">Correo</label>
          <input class="adm-input" id="${id}-email" type="email" autocomplete="username" />
        </div>
        <div class="adm-field" data-reauth-step="password">
          <label class="adm-label" for="${id}-password">Contraseña</label>
          <input class="adm-input" id="${id}-password" type="password" autocomplete="current-password" />
        </div>
        <div class="adm-field" data-reauth-step="code" hidden>
          <label class="adm-label" for="${id}-code">Código de la app</label>
          <input class="adm-input adm-mfa__code" id="${id}-code" type="text"
                 inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                 pattern="[0-9]*" placeholder="000000" />
        </div>
        <p class="adm-error" data-reauth-error hidden></p>
        <div class="adm-dialog__actions">
          <button type="button" class="btn btn--ghost" data-reauth-cancel>Ahora no</button>
          <button type="submit" class="btn">Entrar y seguir</button>
        </div>
      </form>
    `;

    const form = dialog.querySelector('form');
    const email = dialog.querySelector<HTMLInputElement>(`#${id}-email`);
    const password = dialog.querySelector<HTMLInputElement>(`#${id}-password`);
    const errorEl = dialog.querySelector<HTMLElement>('[data-reauth-error]');
    const cancel = dialog.querySelector<HTMLButtonElement>('[data-reauth-cancel]');
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (email) email.value = currentEmail() ?? '';
    cancel?.addEventListener('click', () => resolve(false));

    const code = dialog.querySelector<HTMLInputElement>(`#${id}-code`);
    const passwordFields = dialog.querySelectorAll<HTMLElement>('[data-reauth-step="password"]');
    const codeField = dialog.querySelector<HTMLElement>('[data-reauth-step="code"]');
    const title = dialog.querySelector<HTMLElement>('.adm-dialog__title');

    /** false = Passwort, true = zweiter Faktor. */
    let onCodeStep = false;

    const fail = (message: string): void => {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.hidden = false;
    };

    // Der Wechsel auf Schritt zwei passiert nur, wenn ein Faktor eingerichtet
    // ist. Ohne Faktor bleibt der Dialog Wort fuer Wort der alte.
    function toCodeStep(): void {
      onCodeStep = true;
      for (const el of passwordFields) el.hidden = true;
      if (codeField) codeField.hidden = false;
      if (title) title.textContent = 'Falta el código';
      if (submit) submit.textContent = 'Confirmar y seguir';
      if (password) password.value = '';
      code?.focus();
    }

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!submit) return;
      if (errorEl) errorEl.hidden = true;
      submit.disabled = true;

      const step = onCodeStep
        ? verifyCode(code?.value ?? '')
        : reauthenticate(password?.value ?? '', email?.value);

      void step
        .then((result) => {
          if (result.ok) {
            resolve(true);
            return;
          }
          if (result.needsCode && !onCodeStep) {
            toCodeStep();
            return;
          }
          fail(result.message ?? 'No se pudo entrar.');
          (onCodeStep ? code : password)?.select();
        })
        .finally(() => {
          submit.disabled = false;
        });
    });

    return {
      dialog,
      labelledBy: id,
      closeOnBackdrop: false,
      initialFocus: () => (email && !email.value ? email : password),
    };
  });
}
