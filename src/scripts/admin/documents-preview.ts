import { supabase } from '../../lib/supabase';
import { fail, type VersionRow } from './documents-store';

/**
 * Vorschau- und Download-Adressen für die Dokumentenablage. Siehe
 * PLAN-DOCUMENTOS.md Abschnitt 5 (Sicherheit) und 6 (Vorschau).
 *
 * WICHTIG: der Bucket 'documentos' ist PRIVAT (anders als 'casa-photos').
 * Es gibt hier deshalb bewusst KEIN getPublicUrl() -- jede Adresse kommt aus
 * createSignedUrl() und verfällt nach 60 Sekunden. Eine neu erzeugte Adresse
 * kostet nichts außer einem kurzen Request; sie wird darum nicht zwischen-
 * gespeichert, sondern bei jedem Anzeigen frisch geholt.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE
 * ============================================================================
 *
 *   PREVIEW_AUTOLOAD_LIMIT: number    -- 5 MB, siehe Begründung unten
 *
 *   previewKindFor(version): 'pdf' | 'image' | 'other'
 *   shouldAutoload(version): boolean  -- Ladebremse, siehe unten
 *
 *   getThumbnailUrl(version): Promise<string | null>
 *     -- signierte Adresse des Vorschaubilds. null wenn keins existiert
 *        (kein Bild, oder Vorschau-Erzeugung ist beim Upload fehlgeschlagen).
 *
 *   getOriginalUrl(version): Promise<string>
 *     -- signierte Adresse des Originals. IMMER das, was tatsächlich
 *        angezeigt wird für PDF (iframe) und für "Original ansehen" bei
 *        Bildern. Beachtet selbst NICHT die Ladebremse -- das entscheidet
 *        der Aufrufer mit shouldAutoload(), bevor er diese Funktion ruft.
 *
 *   getDownloadUrl(version): Promise<string>
 *     -- eigener Name für dieselbe Adresse wie getOriginalUrl(), für den
 *        "Descargar"-Knopf: liefert IMMER das Original, nie das Vorschaubild.
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * - Dieses Modul entscheidet nur, WELCHE Art Anzeige und WELCHE Adresse
 *   passt -- es baut kein <iframe>/<img> im DOM. Das macht documents-view.ts
 *   (nicht Teil dieser Datei), damit Datenzugriff und Oberfläche getrennt
 *   bleiben, wie es der Rest des Backends schon macht (store.ts vs. die
 *   *-view.ts-Dateien).
 *
 * - createSignedUrl() läuft NICHT durch withSession()/den Reauth-Dialog.
 *   Es ist ein Lesevorgang (keine Datenänderung), und ein erzwungener
 *   Anmelde-Dialog beim bloßen Anschauen eines Dokuments wäre aufdringlich.
 *   Ist die Sitzung abgelaufen, liefert Supabase einen Fehler, den fail()
 *   bereits in "Tu sesión venció..." übersetzt (errors.ts) -- die Oberfläche
 *   zeigt das als Toast, ohne den Blick auf das Dokument zu blockieren.
 *
 * - shouldAutoload() prüft `byte_size` der VERSION (also des Originals),
 *   nicht die Größe der Vorschau -- die Vorschau ist so oder so klein genug,
 *   um immer automatisch geladen zu werden. Die Bremse gilt ausschließlich
 *   dem Original.
 */

const BUCKET = 'documentos';

/**
 * Ab dieser Originalgröße lädt die Oberfläche NICHT automatisch, sondern
 * zeigt zunächst nur einen "Vista previa (48 MB) — cargar"-Knopf (Plan
 * Abschnitt 6). Grund: ohne diese Bremse verbraucht jedes versehentliche
 * Öffnen eines 50-MB-Druck-PDFs so viel Datenverkehr wie zwanzig normale
 * Dokumente -- bei einem Datenverkehrslimit von 5 GB im kostenlosen Tarif
 * (Plan Abschnitt 7) ist das die wirksamste einzelne Maßnahme dagegen, und
 * sie kostet nichts.
 */
export const PREVIEW_AUTOLOAD_LIMIT = 5 * 1024 * 1024;

export type PreviewKind = 'pdf' | 'image' | 'other';

/**
 * Welche Art Anzeige zu einer Version passt (Plan Abschnitt 6):
 * PDF -> iframe, Bild -> img, alles andere -> nur Dateisymbol + Download.
 */
export function previewKindFor(version: Pick<VersionRow, 'mime_type'>): PreviewKind {
  if (version.mime_type === 'application/pdf') return 'pdf';
  if (version.mime_type.startsWith('image/')) return 'image';
  return 'other';
}

/** true, wenn das Original automatisch geladen werden darf (siehe PREVIEW_AUTOLOAD_LIMIT). */
export function shouldAutoload(version: Pick<VersionRow, 'byte_size'>): boolean {
  return version.byte_size <= PREVIEW_AUTOLOAD_LIMIT;
}

async function createSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) fail(error);
  if (!data?.signedUrl) fail(new Error('No se pudo generar el enlace de vista previa.'));
  return data.signedUrl;
}

/**
 * Signierte Adresse des kleinen Vorschaubilds -- null, wenn keins existiert
 * (kein Bild, oder die Erzeugung beim Upload ist fehlgeschlagen; siehe
 * documents-upload.ts). Die Oberfläche fällt in diesem Fall auf
 * getOriginalUrl() zurück, UNTER Beachtung von shouldAutoload().
 */
export async function getThumbnailUrl(version: VersionRow): Promise<string | null> {
  if (previewKindFor(version) !== 'image' || !version.preview_path) return null;
  return createSignedUrl(version.preview_path);
}

/**
 * Signierte Adresse des ORIGINALS. Prüft selbst nicht, ob die Datei "groß"
 * ist -- ruf shouldAutoload(version) vorher, um zu entscheiden, ob das
 * automatisch geladen werden darf oder erst nach einem Klick auf "cargar".
 */
export async function getOriginalUrl(version: VersionRow): Promise<string> {
  return createSignedUrl(version.storage_path);
}

/** Für den "Descargar"-Knopf: immer das Original, nie das Vorschaubild. */
export async function getDownloadUrl(version: VersionRow): Promise<string> {
  return getOriginalUrl(version);
}
