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
import { supabase } from '../../lib/supabase';
import { humanError } from './errors';

export interface AuthState {
  signedIn: boolean;
  email: string | null;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
}

/** Die zuletzt benutzte Adresse, damit der Reauth-Dialog sie vorschlagen kann. */
const LAST_EMAIL_KEY = 'adm:last-email';
/** Ab hier gilt die Sitzung als "läuft gleich ab" und wird aufgefrischt. */
const REFRESH_MARGIN_MS = 60_000;

let state: AuthState = { signedIn: false, email: null };
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
  if (next.signedIn === state.signedIn && next.email === state.email) return;
  state = next;
  rememberEmail(next.email);
  for (const fn of listeners) fn(state);
}

/**
 * Startet die Wache. Idempotent — mehrfaches Aufrufen schadet nicht.
 * Liefert den Anfangszustand, damit die Hülle sofort das Richtige zeigt.
 */
export async function initAuth(): Promise<AuthState> {
  if (!started) {
    started = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      setState({ signedIn: Boolean(session), email: session?.user.email ?? null });
    });

    // Handys frieren Tabs ein; beim Zurückkommen kann der Token abgelaufen
    // sein, ohne dass die automatische Auffrischung gelaufen ist.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.signedIn) void hasValidSession();
    });
  }

  const { data } = await supabase.auth.getSession();
  setState({ signedIn: Boolean(data.session), email: data.session?.user.email ?? null });
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
    setState({ signedIn: false, email: null });
    return false;
  }

  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return true;

  const refreshed = await supabase.auth.refreshSession();
  const ok = !refreshed.error && Boolean(refreshed.data.session);
  if (!ok) setState({ signedIn: false, email: state.email });
  return ok;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, message: humanError(error).message };
  rememberEmail(email.trim());
  return { ok: true };
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
  setState({ signedIn: false, email: state.email });
}

export interface MountedLogin {
  destroy(): void;
}

/**
 * Anmeldeformular in einen Behälter hängen. Der Zustandswechsel danach
 * läuft über `onAuth()` — dieses Formular schaltet nichts selbst um.
 */
export function mountLogin(container: HTMLElement): MountedLogin {
  const wrap = document.createElement('div');
  wrap.className = 'adm-login';
  wrap.innerHTML = `
    <form class="adm-login__card card" novalidate>
      <h1 class="adm-login__title">Panel de Retoños del Edén</h1>
      <p class="adm-login__sub">Talleres y casas de barro</p>
      <div class="adm-field">
        <label class="adm-label" for="adm-login-email">Correo</label>
        <input class="adm-input" id="adm-login-email" type="email" autocomplete="username" required />
      </div>
      <div class="adm-field">
        <label class="adm-label" for="adm-login-password">Contraseña</label>
        <input class="adm-input" id="adm-login-password" type="password" autocomplete="current-password" required />
      </div>
      <p class="adm-error" data-login-error hidden></p>
      <button type="submit" class="btn">Entrar</button>
    </form>
  `;

  const form = wrap.querySelector('form');
  const email = wrap.querySelector<HTMLInputElement>('#adm-login-email');
  const password = wrap.querySelector<HTMLInputElement>('#adm-login-password');
  const errorEl = wrap.querySelector<HTMLElement>('[data-login-error]');
  const submit = wrap.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (email) email.value = recalledEmail() ?? '';

  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!email || !password || !submit) return;
    if (errorEl) errorEl.hidden = true;
    submit.disabled = true;
    try {
      const result = await signIn(email.value, password.value);
      if (!result.ok && errorEl) {
        errorEl.textContent = result.message ?? 'No se pudo entrar.';
        errorEl.hidden = false;
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
  (email && !email.value ? email : password)?.focus();

  return {
    destroy() {
      wrap.remove();
    },
  };
}
