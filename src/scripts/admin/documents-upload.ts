import { supabase } from '../../lib/supabase';
import {
  countVersionsWithPreviewPath,
  countVersionsWithStoragePath,
  createDocument,
  deleteDocumentForever,
  fail,
  findVersionByChecksum,
  listVersions,
  publishVersion,
  submitProposal,
  withSession,
  type DocSource,
  type DocumentRow,
  type NewVersionInput,
  type UploadMode,
  type VersionRow,
} from './documents-store';

/**
 * Upload-Schicht der Dokumentenablage: Prüfsumme, Originalablage, Vorschau-
 * bild, Größenprüfung, Deduplizierung und das Löschen von Storage-Objekten.
 * Siehe PLAN-DOCUMENTOS.md Abschnitte 6 und 7 sowie den Kommentarblock in
 * documents-store.ts (Entscheidungen 1-6) für den größeren Zusammenhang.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE
 * ============================================================================
 *
 *   MAX_UPLOAD_BYTES: number                    -- 50 MB, harte Grenze des
 *                                                   kostenlosen Supabase-Tarifs
 *
 *   uploadNewDocument(opts: {
 *     folderId: string; title: string; file: File;
 *     mode?: UploadMode; note?: string;
 *   }): Promise<{ document: DocumentRow; version: VersionRow; wasDeduplicated: boolean }>
 *
 *   publishNewVersion(opts: {
 *     documentId: string; file: File; mode?: UploadMode; note?: string;
 *   }): Promise<{ version: VersionRow; wasDeduplicated: boolean }>
 *
 *   submitVersionProposal(opts: {
 *     documentId: string; file: File; mode?: UploadMode; note?: string;
 *   }): Promise<{ version: VersionRow; wasDeduplicated: boolean }>
 *
 *   deleteVersionFiles(version: VersionRow): Promise<void>
 *     -- Löscht NUR Storage-Objekte (Original + Vorschau je einzeln geprüft),
 *        NIE die Datenbankzeile. Reihenfolge: erst Storage, dann (vom
 *        Aufrufer) die Zeile -- und ein Objekt nur, wenn keine andere Zeile
 *        mehr darauf zeigt (Deduplizierung/Reaktivieren).
 *
 *   purgeDocumentForever(document: DocumentRow): Promise<void>
 *     -- Orchestriert das endgültige Löschen eines Dokuments aus dem
 *        Papierkorb: alle Versionen laden, je deleteVersionFiles(), danach
 *        documents-store.ts::deleteDocumentForever() (räumt die Zeilen ab,
 *        Kaskade nimmt doc_versions mit).
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * A. Speicherpfad-Segment. Der Plan schreibt `{document_id}/{version_id}.ext`,
 *    aber die echte Zeilen-ID entsteht erst NACH dem Hochladen (siehe
 *    Entscheidung 4 in documents-store.ts). Hier wird stattdessen pro Upload
 *    eine eigene UUID erzeugt (`crypto.randomUUID()`) und für Original UND
 *    Vorschaubild gemeinsam benutzt: `{document_id}/{uuid}.ext` und
 *    `{document_id}/{uuid}.preview.jpg`. Erfüllt denselben Zweck (eindeutig,
 *    nie überschrieben, Original und Vorschau erkennbar zusammengehörig).
 *
 * B. Modus 'foto': die verkleinerte Datei wird selbst zur "Original"-Zeile
 *    (storage_path/checksum/byte_size beziehen sich auf die verkleinerte
 *    Datei) -- das ist laut Plan ausdrücklich der einzige Fall, in dem NICHT
 *    das Original abgelegt wird. Für die Vorschau wird davon zusätzlich noch
 *    einmal herunterskaliert.
 *
 * C. Vorschaubild-Maße: vom Plan nicht festgelegt. Gewählt: 1200 px längste
 *    Kante, JPEG 0,75 -- kleiner als die 2000 px/0,82 von image-upload.ts,
 *    weil diese Vorschau nur der schnellen Ansicht im Backend dient, nicht
 *    der öffentlichen Website.
 *
 * D. Dedup übernimmt bei Treffer auch preview_path/preview_byte_size der
 *    gefundenen Zeile (nicht nur storage_path) -- identische Bytes ergeben
 *    zwangsläufig dieselbe Vorschau, ein zweites Mal erzeugen wäre reine
 *    Verschwendung.
 *
 * E. Größenprüfung immer gegen die Originaldatei (vor jeder Verarbeitung),
 *    auch im Modus 'foto' -- eine zu große Auswahl soll sofort abgelehnt
 *    werden, nicht erst nach dem (unnötigen) Verkleinern.
 *
 * F. Storage-Schreibvorgänge (Upload/Löschen) laufen durch dasselbe
 *    withSession()-Muster wie die RPC-Aufrufe in documents-store.ts, obwohl
 *    der Plan das nur für den Store ausdrücklich verlangt -- konsequent zu
 *    Ende gedacht, weil eine 40-MB-Datei lange genug unterwegs ist, dass die
 *    Sitzung währenddessen ablaufen kann.
 */

const BUCKET = 'documentos';

/** Harte Grenze des kostenlosen Supabase-Tarifs (Plan Abschnitt 7). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const PHOTO_MODE_MAX_DIMENSION = 2000;
const PHOTO_MODE_JPEG_QUALITY = 0.82;
const PREVIEW_MAX_DIMENSION = 1200;
const PREVIEW_JPEG_QUALITY = 0.75;

export interface UploadOutcome {
  version: VersionRow;
  /** true, wenn wegen gleicher Prüfsumme KEINE neue Datei hochgeladen wurde. */
  wasDeduplicated: boolean;
}

// ---------------------------------------------------------------------------
// Kleine Hilfsmittel
// ---------------------------------------------------------------------------

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Dateiendung ohne führenden Punkt, klein geschrieben. Kein Regex mit
 *  Lookbehind (bricht altes iOS Safari, siehe HANDOFF.md) -- reines String-Suchen. */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return 'bin';
  return fileName.slice(dot + 1).toLowerCase();
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** SHA-256 der Bytes eines Blobs, als Hex-String -- eingebaut, keine Bibliothek. */
async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verkleinert ein Bild client-seitig auf ein Canvas -- eigenständige Variante
 * von resizeImage() in image-upload.ts (dort nicht wiederverwendbar ohne
 * dessen feste Konstanten zu ändern, siehe Aufgabenbeschreibung: eigene
 * Funktion ist ausdrücklich erlaubt).
 */
function resizeImageTo(source: Blob, maxDimension: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error('No se pudo procesar la imagen.'))),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = objectUrl;
  });
}

function assertUnderSizeLimit(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Este archivo pesa ${formatMegabytes(file.size)} y supera el límite de 50 MB del plan gratuito ` +
        'de Supabase. Elegí un archivo más chico, o pedile a Maxi que revise el plan de almacenamiento.',
    );
  }
}

async function uploadToStorage(path: string, blob: Blob, contentType: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType,
      upsert: false,
    });
    if (error) fail(error);
  });
}

// ---------------------------------------------------------------------------
// Vorbereitung: aus einer Datei + Modus wird eine fertige Version-Eingabe
// ---------------------------------------------------------------------------

interface PreparedVersion {
  storagePath: string;
  previewPath: string | null;
  previewByteSize: number | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  wasDeduplicated: boolean;
}

async function prepareVersion(documentId: string, file: File, mode: UploadMode): Promise<PreparedVersion> {
  assertUnderSizeLimit(file);

  // Modus 'foto': die verkleinerte Datei WIRD das Original der neuen Version
  // -- siehe Entscheidung B im Dateikopf. Das ist absichtlich der einzige
  // Fall im ganzen Modul, in dem nicht die hochgeladenen Bytes 1:1 gespeichert
  // werden, und er muss dafür ausdrücklich gewählt werden (mode === 'foto').
  const isPhotoMode = mode === 'foto' && isImageMime(file.type);
  const storedBlob: Blob = isPhotoMode
    ? await resizeImageTo(file, PHOTO_MODE_MAX_DIMENSION, PHOTO_MODE_JPEG_QUALITY)
    : file;
  const mimeType = isPhotoMode ? 'image/jpeg' : file.type || 'application/octet-stream';
  const ext = isPhotoMode ? 'jpg' : extensionOf(file.name);

  const checksum = await sha256Hex(storedBlob);

  // Deduplizierung: existiert diese Prüfsumme schon, verweist die neue
  // Version auf denselben storage_path (und, wenn vorhanden, denselben
  // preview_path) statt ein zweites Mal hochzuladen.
  const existing = await findVersionByChecksum(checksum);
  if (existing) {
    return {
      storagePath: existing.storage_path,
      previewPath: existing.preview_path,
      previewByteSize: existing.preview_byte_size,
      fileName: file.name,
      mimeType,
      byteSize: storedBlob.size,
      checksum,
      wasDeduplicated: true,
    };
  }

  const uploadId = crypto.randomUUID();
  const storagePath = `${documentId}/${uploadId}.${ext}`;
  await uploadToStorage(storagePath, storedBlob, mimeType);

  // Zusätzliches Vorschaubild -- nur für Bilddateien, ersetzt nie das Original.
  // Für PDFs und Office-Dateien bleibt preview_path null (Plan Abschnitt 4.2).
  let previewPath: string | null = null;
  let previewByteSize: number | null = null;
  if (isImageMime(mimeType)) {
    try {
      const previewBlob = await resizeImageTo(storedBlob, PREVIEW_MAX_DIMENSION, PREVIEW_JPEG_QUALITY);
      previewPath = `${documentId}/${uploadId}.preview.jpg`;
      await uploadToStorage(previewPath, previewBlob, 'image/jpeg');
      previewByteSize = previewBlob.size;
    } catch {
      // Eine fehlgeschlagene Vorschau darf den Upload des Originals nicht
      // zunichtemachen -- die Datei bleibt einfach ohne kleine Vorschau
      // (die Oberfläche fällt dann auf das Original zurück, siehe
      // documents-preview.ts).
      previewPath = null;
      previewByteSize = null;
    }
  }

  return {
    storagePath,
    previewPath,
    previewByteSize,
    fileName: file.name,
    mimeType,
    byteSize: storedBlob.size,
    checksum,
    wasDeduplicated: false,
  };
}

function toNewVersionInput(
  documentId: string,
  prepared: PreparedVersion,
  note: string | undefined,
  source: DocSource,
): NewVersionInput {
  return {
    documentId,
    storagePath: prepared.storagePath,
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    byteSize: prepared.byteSize,
    checksum: prepared.checksum,
    previewPath: prepared.previewPath,
    previewByteSize: prepared.previewByteSize,
    note,
    source,
  };
}

// ---------------------------------------------------------------------------
// Öffentliche Upload-Funktionen
// ---------------------------------------------------------------------------

export async function uploadNewDocument(opts: {
  folderId: string;
  title: string;
  file: File;
  /** Voreinstellung IMMER 'original' -- Aufrufer übersteuert mit dem
   *  upload_mode des Ordners bzw. der Wahl der Nutzerin. */
  mode?: UploadMode;
  note?: string;
}): Promise<{ document: DocumentRow; version: VersionRow; wasDeduplicated: boolean }> {
  // Größe VOR dem Anlegen der Zeile prüfen, nicht erst in prepareVersion.
  // Sonst bliebe bei einer zu großen Datei ein Dokument ohne jede Version
  // zurück -- sichtbar in der Liste, aber zu nichts zu gebrauchen, und die
  // Nutzerin müsste es von Hand wieder wegräumen.
  assertUnderSizeLimit(opts.file);

  const document = await createDocument(opts.folderId, opts.title);
  const prepared = await prepareVersion(document.id, opts.file, opts.mode ?? 'original');
  const version = await publishVersion(toNewVersionInput(document.id, prepared, opts.note, 'upload'));
  return { document, version, wasDeduplicated: prepared.wasDeduplicated };
}

export async function publishNewVersion(opts: {
  documentId: string;
  file: File;
  mode?: UploadMode;
  note?: string;
}): Promise<UploadOutcome> {
  const prepared = await prepareVersion(opts.documentId, opts.file, opts.mode ?? 'original');
  const version = await publishVersion(toNewVersionInput(opts.documentId, prepared, opts.note, 'upload'));
  return { version, wasDeduplicated: prepared.wasDeduplicated };
}

export async function submitVersionProposal(opts: {
  documentId: string;
  file: File;
  mode?: UploadMode;
  note?: string;
}): Promise<UploadOutcome> {
  const prepared = await prepareVersion(opts.documentId, opts.file, opts.mode ?? 'original');
  const version = await submitProposal(toNewVersionInput(opts.documentId, prepared, opts.note, 'upload'));
  return { version, wasDeduplicated: prepared.wasDeduplicated };
}

// ---------------------------------------------------------------------------
// Löschen -- erst Storage, dann Datenbankzeile
// ---------------------------------------------------------------------------

/**
 * Entfernt die Storage-Objekte einer Version (Original + Vorschau), aber NUR
 * wenn keine andere Versionszeile (irgendeines Dokuments -- Deduplizierung
 * ist global) noch darauf zeigt. Löscht NIE die Datenbankzeile selbst; das
 * macht der Aufrufer danach, in genau dieser Reihenfolge.
 */
export async function deleteVersionFiles(version: VersionRow): Promise<void> {
  return withSession(async () => {
    const stillReferenced = await countVersionsWithStoragePath(version.storage_path, version.id);
    if (stillReferenced === 0) {
      const { error } = await supabase.storage.from(BUCKET).remove([version.storage_path]);
      if (error) fail(error);
    }

    if (version.preview_path) {
      const previewStillReferenced = await countVersionsWithPreviewPath(version.preview_path, version.id);
      if (previewStillReferenced === 0) {
        const { error } = await supabase.storage.from(BUCKET).remove([version.preview_path]);
        if (error) fail(error);
      }
    }
  });
}

/**
 * Endgültiges Löschen eines Dokuments aus dem Papierkorb: für jede Version
 * erst die Storage-Objekte (deleteVersionFiles, dedup-sicher), danach die
 * Datenbankzeilen (documents-store.ts::deleteDocumentForever -- die Kaskade
 * nimmt die doc_versions-Zeilen mit).
 */
export async function purgeDocumentForever(document: DocumentRow): Promise<void> {
  const versions = await listVersions(document.id);
  for (const version of versions) {
    await deleteVersionFiles(version);
  }
  await deleteDocumentForever(document.id);
}
