/**
 * Anmeldung und Sitzungswache.
 *
 * Die Seite ist statisch (astro.config.mjs, `output: 'static'`); der Schutz
 * liegt in Row Level Security (supabase/schema.sql). Ohne gültige Sitzung
 * gibt die Datenbank weder Entwürfe heraus noch nimmt sie Schreibzugriffe an.
 * Dieses Modul kümmert sich nur um den Zustand im Browser.
 *
 * Gegenüber v1 geändert:
 * - Kein fest verdrahtetes Markup mehr. Früher suchte das Modul beim Laden
 *   `[data-admin-login]` & Co. und stürzte ohne dieses Markup ab. Jetzt baut
 *   `mountLogin()` das Formular selbst, und die Hülle entscheidet, wohin.
 * - `hasValidSession()` frischt kurz vor Ablauf still auf. Das ist die halbe
 *   Miete gegen P13 (Sitzung läuft während des Tippens ab); die andere Hälfte
 *   ist `reauthDialog()` in dialog.ts, das den Schreibvorgang wiederholt.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { humanError } from './errors';
import { mfaRequired, verifyLoginCode } from './mfa';

export interface AuthState {
  signedIn: boolean;
  email: string | null;
  /**
   * Passwort stimmt, aber dieser Sitzung fehlt noch der zweite Faktor.
   * Solange kein Faktor eingerichtet ist, ist das immer false und alles
   * verhaelt sich exakt wie vorher.
   */
  awaitingCode: boolean;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
  /** Nicht durchgefallen, nur noch nicht fertig: es fehlt der Code. */
  needsCode?: boolean;
}

/** Die zuletzt benutzte Adresse, damit der Reauth-Dialog sie vorschlagen kann. */
const LAST_EMAIL_KEY = 'adm:last-email';
/** Ab hier gilt die Sitzung als "läuft gleich ab" und wird aufgefrischt. */
const REFRESH_MARGIN_MS = 60_000;

let state: AuthState = { signedIn: false, email: null, awaitingCode: false };
let started = false;
const listeners = new Set<(s: AuthState) => void>();

function rememberEmail(email: string | null): void {
  if (!email) return;
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // Privates Fenster ohne Speicher: dann eben ohne Vorschlag.
  }
}

function recalledEmail(): string | null {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY);
  } catch {
    return null;
  }
}

function setState(next: AuthState): void {
  if (
    next.signedIn === state.signedIn &&
    next.email === state.email &&
    next.awaitingCode === state.awaitingCode
  ) {
    return;
  }
  state = next;
  rememberEmail(next.email);
  for (const fn of listeners) fn(state);
}

/**
 * Aus einer Sitzung den Zustand ableiten.
 *
 * `signedIn` heisst hier bewusst "darf das Panel sehen", nicht bloss "hat ein
 * Token". Wer ein Passwort, aber noch keinen Code eingegeben hat, steht auf
 * aal1 -- die Datenbank gibt ihm (sobald die aal2-Zeile in `is_admin()` scharf
 * ist) nichts heraus. Ihm dann die Liste zu zeigen, hiesse ihm eine
 * Fehlermeldung nach der anderen zu zeigen.
 */
async function resolveState(session: Session | null): Promise<void> {
  if (!session) {
    setState({ signedIn: false, email: null, awaitingCode: false });
    return;
  }

  const needsCode = await mfaRequired();
  setState({
    signedIn: !needsCode,
    email: session.user.email ?? null,
    awaitingCode: needsCode,
  });
}

/**
 * Startet die Wache. Idempotent — mehrfaches Aufrufen schadet nicht.
 * Liefert den Anfangszustand, damit die Hülle sofort das Richtige zeigt.
 */
export async function initAuth(): Promise<AuthState> {
  if (!started) {
    started = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      void resolveState(session);
    });

    // Handys frieren Tabs ein; beim Zurückkommen kann der Token abgelaufen
    // sein, ohne dass die automatische Auffrischung gelaufen ist.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.signedIn) void hasValidSession();
    });
  }

  const { data } = await supabase.auth.getSession();
  await resolveState(data.session);
  return state;
}

/** Meldet Zustandswechsel. Ruft sofort mit dem aktuellen Stand auf. */
export function onAuth(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function isSignedIn(): boolean {
  return state.signedIn;
}

export function currentEmail(): string | null {
  return state.email ?? recalledEmail();
}

/**
 * Gibt es gerade eine Sitzung, die für den nächsten Schreibvorgang reicht?
 * Frischt auf, wenn sie in weniger als einer Minute abläuft.
 */
export async function hasValidSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    setState({ signedIn: false, email: null, awaitingCode: false });
    return false;
  }

  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt - Date.now() <= REFRESH_MARGIN_MS) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      setState({ signedIn: false, email: state.email, awaitingCode: false });
      return false;
    }
  }

  // Eine frische Sitzung auf aal1 nuetzt nichts: sobald die aal2-Zeile in
  // `is_admin()` scharf ist, weist die Datenbank jeden Schreibvorgang ab.
  // Lieber hier ehrlich false melden -- dann fragt reauthDialog() nach dem
  // Code und der Schreibvorgang laeuft danach einmal erneut.
  if (await mfaRequired()) {
    setState({ signedIn: false, email: state.email, awaitingCode: true });
    return false;
  }

  return true;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, message: humanError(error).message };
  rememberEmail(email.trim());

  // Ohne eingerichteten Faktor ist das immer false -- der Rueckgabewert
  // sieht dann exakt aus wie vor der Umstellung.
  if (await mfaRequired()) return { ok: false, needsCode: true };
  return { ok: true };
}

/**
 * Zweiter Schritt der Anmeldung. Hebt die Sitzung von aal1 auf aal2; erst
 * danach meldet `onAuth()` `signedIn: true` und die Huelle baut das Panel.
 */
export async function verifyCode(code: string): Promise<AuthResult> {
  try {
    await verifyLoginCode(code);
  } catch (err) {
    return {
      ok: false,
      needsCode: true,
      message: err instanceof Error ? err.message : 'No se pudo verificar el código.',
    };
  }

  const { data } = await supabase.auth.getSession();
  await resolveState(data.session);
  return { ok: true };
}

/** Wartet diese Sitzung gerade auf den Code? Fuer die Huelle. */
export function isAwaitingCode(): boolean {
  return state.awaitingCode;
}

/**
 * Nach Ablauf wieder hineinkommen. Versucht erst still aufzufrischen —
 * oft hat der Browser den Token längst erneuert und es braucht gar kein
 * Passwort. Ohne Adresse wird die zuletzt benutzte genommen.
 */
export async function reauthenticate(password: string, email?: string): Promise<AuthResult> {
  if (!password) {
    return (await hasValidSession())
      ? { ok: true }
      : { ok: false, message: 'Escribí tu contraseña para volver a entrar.' };
  }
  const address = (email ?? currentEmail() ?? '').trim();
  if (!address) {
    return { ok: false, message: 'Falta el correo con el que entrás al panel.' };
  }
  return signIn(address, password);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  setState({ signedIn: false, email: state.email, awaitingCode: false });
}

export interface MountedLogin {
  destroy(): void;
}

/**
 * Anmeldeformular in einen Behälter hängen. Der Zustandswechsel danach
 * läuft über `onAuth()` — dieses Formular schaltet nichts selbst um.
 *
 * Zwei Schritte, aber nur wenn nötig: Schritt zwei (Code) taucht ausschliesslich
 * auf, wenn ein zweiter Faktor eingerichtet ist. Ohne Faktor sieht die Nutzerin
 * genau dasselbe Formular wie vorher.
 */
export function mountLogin(container: HTMLElement): MountedLogin {
  const wrap = document.createElement('div');
  wrap.className = 'adm-login';
  wrap.innerHTML = `
    <form class="adm-login__card card" novalidate>
      <h1 class="adm-login__title">Panel de Retoños del Edén</h1>
      <p class="adm-login__sub" data-login-sub>Talleres y casas de barro</p>
      <div data-login-step="password">
        <div class="adm-field">
          <label class="adm-label" for="adm-login-email">Correo</label>
          <input class="adm-input" id="adm-login-email" type="email" autocomplete="username" required />
        </div>
        <div class="adm-field">
          <label class="adm-label" for="adm-login-password">Contraseña</label>
          <input class="adm-input" id="adm-login-password" type="password" autocomplete="current-password" required />
        </div>
      </div>
      <div class="adm-field" data-login-step="code" hidden>
        <label class="adm-label" for="adm-login-code">Código de la app</label>
        <input class="adm-input adm-mfa__code" id="adm-login-code" type="text"
               inputmode="numeric" autocomplete="one-time-code" maxlength="6"
               pattern="[0-9]*" placeholder="000000" />
      </div>
      <p class="adm-error" data-login-error hidden></p>
      <button type="submit" class="btn" data-login-submit>Entrar</button>
    </form>
  `;

  const form = wrap.querySelector('form');
  const email = wrap.querySelector<HTMLInputElement>('#adm-login-email');
  const password = wrap.querySelector<HTMLInputElement>('#adm-login-password');
  const code = wrap.querySelector<HTMLInputElement>('#adm-login-code');
  const passwordStep = wrap.querySelector<HTMLElement>('[data-login-step="password"]');
  const codeStep = wrap.querySelector<HTMLElement>('[data-login-step="code"]');
  const subEl = wrap.querySelector<HTMLElement>('[data-login-sub]');
  const errorEl = wrap.querySelector<HTMLElement>('[data-login-error]');
  const submit = wrap.querySelector<HTMLButtonElement>('[data-login-submit]');

  if (email) email.value = recalledEmail() ?? '';

  /** false = Passwortschritt, true = Codeschritt. */
  let onCodeStep = false;

  const fail = (message: string): void => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  function toCodeStep(): void {
    onCodeStep = true;
    if (passwordStep) passwordStep.hidden = true;
    if (codeStep) codeStep.hidden = false;
    if (subEl) subEl.textContent = 'Escribí el código de tu app de autenticación.';
    if (submit) submit.textContent = 'Confirmar';
    if (password) password.value = '';
    code?.focus();
  }

  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!submit) return;
    if (errorEl) errorEl.hidden = true;
    submit.disabled = true;

    try {
      if (onCodeStep) {
        if (!code) return;
        const result = await verifyCode(code.value);
        if (!result.ok) {
          fail(result.message ?? 'No se pudo confirmar.');
          code.select();
        }
        return;
      }

      if (!email || !password) return;
      const result = await signIn(email.value, password.value);

      if (result.needsCode) {
        toCodeStep();
        return;
      }
      if (!result.ok) {
        fail(result.message ?? 'No se pudo entrar.');
        password.select();
        return;
      }
      password.value = '';
    } finally {
      submit.disabled = false;
    }
  };

  form?.addEventListener('submit', (event) => void onSubmit(event as SubmitEvent));
  container.replaceChildren(wrap);

  // Sonderfall: die Seite wird mit einer halbfertigen Sitzung neu geladen
  // (Passwort gab es schon, Code fehlt noch). Dann gleich Schritt zwei zeigen,
  // statt nach dem Passwort zu fragen, das die Sitzung laengst hat.
  if (isAwaitingCode()) toCodeStep();
  else (email && !email.value ? email : password)?.focus();

  return {
    destroy() {
      wrap.remove();
    },
  };
}
