/**
 * Zweiter Faktor (TOTP) — die Datenseite.
 *
 * Bis hierher war ein Passwort der gesamte Schutz des Panels — und damit der
 * gesamte Schutz der Datenbank, weil es kein Backend gibt, das noch einmal
 * nachfragt (PLAN-SICHERHEIT.md, Befund B3).
 *
 * Zwei Dinge sind wichtig:
 *
 * 1. **Es aktiviert sich selbst.** Solange kein Faktor eingerichtet ist,
 *    meldet `mfaRequired()` false und alles verhält sich exakt wie vorher.
 *    Erst wenn die Nutzerin einen Faktor bestätigt hat, verlangt die
 *    Anmeldung einen Code. Es gibt keinen Schalter, den man in der falschen
 *    Reihenfolge umlegen kann.
 *
 * 2. **Die Datenbank erzwingt es erst später, von Hand.** In
 *    `supabase/migrations/002_admin_allowlist.sql` steht in `is_admin()` eine
 *    auskommentierte Zeile (`aal = 'aal2'`). Die wird erst nachgezogen, wenn
 *    die Nutzerin nachweislich eingerichtet ist und sich einmal erfolgreich
 *    mit Code angemeldet hat. Andersherum sperrt sie sich zuverlässig aus.
 *
 * Dieses Modul hängt bewusst an keinem Dialog und an keiner Ansicht: `auth.ts`
 * und `dialog.ts` brauchen die Prüfung, und ein Import-Zyklus über die
 * Oberfläche wäre die Folge. Die Oberfläche liegt daher in `mfa-dialog.ts`.
 */
import { supabase } from '../../lib/supabase';
import { humanError } from './errors';

export interface MfaState {
  /** Es gibt einen bestätigten Faktor -- die Anmeldung verlangt einen Code. */
  enrolled: boolean;
  /** Id des bestätigten Faktors, für Anmeldung und Entfernen. */
  factorId: string | null;
  /** Diese Sitzung steht auf aal1, müsste aber auf aal2 -- Code fehlt noch. */
  required: boolean;
}

const EMPTY: MfaState = { enrolled: false, factorId: null, required: false };

/** Name, unter dem der Faktor in der Authenticator-App auftaucht. */
const FRIENDLY_NAME = 'Panel Retoños';

/**
 * Sitzung und Faktoren in einem Rutsch.
 *
 * `getAuthenticatorAssuranceLevel()` entscheidet die eigentliche Frage:
 * `nextLevel` ist genau dann 'aal2', wenn ein bestätigter Faktor existiert.
 * Ohne Sitzung liefert die Funktion nichts Brauchbares -- dann ist der leere
 * Zustand die richtige Antwort, nicht ein Fehler.
 */
export async function mfaState(): Promise<MfaState> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return EMPTY;

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return EMPTY;

  const factors = await supabase.auth.mfa.listFactors();
  const verified = factors.data?.totp?.[0] ?? null;

  return {
    enrolled: data.nextLevel === 'aal2',
    factorId: verified?.id ?? null,
    required: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2',
  };
}

/** Kurzform für den heißen Pfad: fehlt dieser Sitzung noch der Code? */
export async function mfaRequired(): Promise<boolean> {
  return (await mfaState()).required;
}

export interface EnrollStart {
  factorId: string;
  /** SVG als Zeichenkette, direkt von Supabase. */
  qrSvg: string;
  /** Für den Fall, dass die Kamera nicht will: der Schlüssel zum Abtippen. */
  secret: string;
}

/**
 * Einrichtung beginnen. Der Faktor ist danach angelegt, aber noch
 * unbestätigt — erst `activateTotp()` macht ihn scharf.
 *
 * Räumt vorher liegengebliebene unbestätigte Faktoren ab. Die entstehen
 * leicht: Dialog geöffnet, QR-Code gesehen, Fenster geschlossen. Beim
 * nächsten Versuch würde Supabase sonst über den doppelten Namen stolpern.
 */
export async function enrollTotp(): Promise<EnrollStart> {
  const existing = await supabase.auth.mfa.listFactors();
  for (const factor of existing.data?.all ?? []) {
    if (factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: FRIENDLY_NAME,
    issuer: 'Retoños del Edén',
  });
  if (error || !data) throw new Error(humanError(error).message);

  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Einen Code gegen einen Faktor prüfen. Bei der Einrichtung beweist er, dass
 * die App wirklich denselben Schlüssel hat; bei der Anmeldung hebt derselbe
 * Vorgang die Sitzung von aal1 auf aal2.
 */
export async function verifyFactor(factorId: string, code: string): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw new Error(humanError(challenge.error).message);

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (error) throw new Error(codeError(error));
}

/** Einrichtung abschließen. Erst danach verlangt die Anmeldung den Code. */
export async function activateTotp(factorId: string, code: string): Promise<void> {
  await verifyFactor(factorId, code);
}

/**
 * Code bei der Anmeldung prüfen. Ab hier gibt die Datenbank (sobald die
 * aal2-Zeile in `is_admin()` scharf ist) überhaupt erst etwas heraus.
 */
export async function verifyLoginCode(code: string): Promise<void> {
  const factors = await supabase.auth.mfa.listFactors();
  const factor = factors.data?.totp?.[0];
  if (!factor) throw new Error('No hay un segundo factor configurado.');
  await verifyFactor(factor.id, code);
}

/** Faktor entfernen. Danach reicht wieder das Passwort allein. */
export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(humanError(error).message);
}

/**
 * Ein falscher Code ist der mit Abstand häufigste Fehler hier, und die rohe
 * Meldung von Supabase ist englisch und technisch. Der Rest läuft über die
 * übliche Übersetzung in errors.ts.
 */
function codeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (/invalid|expired|totp|code/i.test(raw)) {
    return 'Ese código no es válido. Fijate que sea el actual — cambian cada 30 segundos.';
  }
  return humanError(error).message;
}

/**
 * Sechsstelliges Zahlenfeld. `inputmode="numeric"` holt am Handy die
 * Zifferntastatur, `autocomplete="one-time-code"` lässt das Betriebssystem
 * den Code aus der Benachrichtigung anbieten. Liegt hier, weil sowohl der
 * Einrichtungsdialog als auch der Reauth-Dialog es brauchen.
 */
export function codeInput(id: string): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'adm-input adm-mfa__code';
  input.id = id;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.maxLength = 6;
  input.pattern = '[0-9]*';
  input.placeholder = '000000';
  return input;
}
