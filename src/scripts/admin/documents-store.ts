import { supabase } from '../../lib/supabase';
import { hasValidSession } from './auth';
import { reauthDialog } from './dialog';
import { humanError, sessionCancelledError } from './errors';

/**
 * Datenzugriff der Dokumentenablage (#/documentos) -- im Muster von store.ts,
 * siehe dort für die ausführliche Begründung von withSession() und fail().
 * Tabellen- und Spaltennamen folgen PLAN-DOCUMENTOS.md Abschnitt 4 wörtlich;
 * ein paralleler Agent schreibt die Migration `supabase/migrations/003_*.sql`
 * gegen genau dieselben Namen.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (für documents-view.ts, documents-upload.ts,
 * documents-preview.ts, documents-comments.ts, documents-tasks.ts, people-view.ts)
 * ============================================================================
 *
 * Typen:
 *   VersionState, UploadMode, DocSource, ProfileRole, TaskStatus,
 *   MentionTargetType, FolderRow, DocumentRow, DocumentWithCurrentVersion,
 *   VersionRow, ProfileRow, CommentRow, MentionRow, TaskRow, ReadRow,
 *   NewVersionInput, ActivityRow
 *
 * Ordner:
 *   listFolders(parentId?: string | null): Promise<FolderRow[]>
 *   createFolder(name, opts?: { parentId?, uploadMode? }): Promise<FolderRow>
 *   renameFolder(id, name): Promise<void>
 *   setFolderUploadMode(id, mode): Promise<void>
 *   setFolderSortOrder(id, value): Promise<void>
 *   trashFolder(id): Promise<void>
 *   restoreFolder(id): Promise<void>
 *   deleteFolderForever(id): Promise<void>
 *
 * Dokumente:
 *   listDocuments(folderId): Promise<DocumentWithCurrentVersion[]>
 *   getDocument(id): Promise<DocumentWithCurrentVersion | null>
 *   createDocument(folderId, title): Promise<DocumentRow>
 *   renameDocument(id, title): Promise<void>
 *   trashDocument(id): Promise<void>
 *   restoreDocument(id): Promise<void>
 *   deleteDocumentForever(id): Promise<void>   -- siehe Warnhinweis unten
 *
 * Versionen:
 *   listVersions(documentId): Promise<VersionRow[]>
 *   getVersion(id): Promise<VersionRow | null>
 *   findVersionByChecksum(checksum): Promise<VersionRow | null>
 *   countVersionsWithStoragePath(path, excludeVersionId?): Promise<number>
 *   countVersionsWithPreviewPath(path, excludeVersionId?): Promise<number>
 *
 * Zustandsübergänge (RPC, siehe Plan Abschnitt 4.2):
 *   publishVersion(input: NewVersionInput): Promise<VersionRow>
 *   submitProposal(input: NewVersionInput): Promise<VersionRow>
 *   acceptProposal(versionId): Promise<VersionRow>
 *   rejectProposal(versionId, reason): Promise<VersionRow>
 *   reactivateVersion(versionId): Promise<VersionRow>
 *
 * Profile:
 *   listProfiles(): Promise<ProfileRow[]>
 *   getProfile(userId): Promise<ProfileRow | null>
 *   currentProfile(): Promise<ProfileRow | null>
 *   currentRole(): Promise<ProfileRole | null>
 *
 * Papierkorb:
 *   listTrashedFolders(): Promise<FolderRow[]>
 *   listTrashedDocuments(): Promise<DocumentRow[]>
 *
 * Geteilte Hilfsmittel (auch von documents-upload.ts und documents-preview.ts
 * benutzt, deshalb hier -- anders als in store.ts -- exportiert):
 *   withSession(run), fail(error)
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS (siehe auch Kommentare an Ort und
 * Stelle unten):
 *
 * 1. RPC-Parameternamen -- abgeglichen mit der fertigen Migration 003
 *    (SQL-Agent, security definer):
 *      doc_publish_version(p_document_id, p_storage_path, p_file_name,
 *        p_mime_type, p_byte_size, p_checksum, p_preview_path,
 *        p_preview_byte_size, p_source, p_source_payload, p_note,
 *        p_storage_provider)
 *      doc_submit_proposal(...)               -- identische Signatur
 *      doc_accept_proposal(p_version_id)
 *      doc_reject_proposal(p_version_id, p_reason)
 *      doc_reactivate_version(p_version_id)
 *    Alle geben die betroffene doc_versions-Zeile zurück (kein Nachladen
 *    nötig) -- einzeln oder als einelementiges Array, unwrapRow()
 *    akzeptiert beides. `doc_versions` gewährt `authenticated` laut
 *    Migration NUR `select` -- jede Zustandsänderung MUSS über eine dieser
 *    fünf RPC-Funktionen laufen, nie über insert()/update() direkt (sonst
 *    könnte ein Fehler im Browser kurzzeitig zwei `current`-Zeilen erzeugen).
 *    Dieses Modul hält sich strikt daran: alle Lesevorgänge auf doc_versions
 *    unten sind reine .select()-Aufrufe.
 *
 * 2. uploaded_by/decided_by kommen NIE als Parameter vom Client -- die
 *    RPC-Funktionen müssen sie serverseitig aus auth.uid() setzen. Alles
 *    andere würde erlauben, sich als jemand anderes auszugeben.
 *
 * 3. created_by bei Ordnern/Dokumenten (reine INSERTs, keine RPC): die Plan-
 *    Tabellen haben dafür KEINEN `default auth.uid()`. Hier wird der Wert
 *    darum explizit aus der laufenden Sitzung gelesen (currentUserId()) und
 *    mitgeschickt.
 *
 * 4. Kein `p_version_id`, der vom Client vorgegeben wird. `doc_versions.id`
 *    bleibt server-generiert (gen_random_uuid()). Der Speicherpfad braucht
 *    zwar laut Plan Abschnitt 5 ein `{version_id}`-Segment, aber Original
 *    und Vorschaubild müssen VOR der Datenbankzeile hochgeladen werden (die
 *    Zeile verlangt `storage_path not null`) -- die echte Zeilen-ID ist zu
 *    diesem Zeitpunkt noch gar nicht bekannt. documents-upload.ts erzeugt
 *    stattdessen selbst eine UUID als Dateinamen-Segment. Das erfüllt den
 *    Zweck (eindeutiger, nie überschriebener Pfad je Upload) ohne dass der
 *    Client der Datenbank ihren Primärschlüssel vorschreiben müsste.
 *
 * 5. listDocuments()/getDocument() holen die aktuelle Version über eine
 *    ZWEITE, getrennte Abfrage statt über eine gefilterte PostgREST-
 *    Verknüpfung (`select('*, doc_versions!inner(*)')`). Das Verhalten
 *    einer gefilterten Verknüpfung bei "kein Treffer" hängt von der
 *    PostgREST-Version ab (Elternzeile verschwindet ganz oder bleibt mit
 *    leerem Array) -- zwei einfache Abfragen sind minimal teurer, aber
 *    eindeutig und zeigen auch ein Dokument an, dessen erste Version aus
 *    irgendeinem Grund nie fertig angelegt wurde, statt es unsichtbar
 *    verschwinden zu lassen.
 *
 * 6. deleteFolderForever()/deleteDocumentForever() löschen NUR Datenbank-
 *    zeilen. `documents` hat `on delete cascade` auf `doc_versions`, das
 *    räumt die Versionszeilen mit auf -- aber NICHT die Storage-Objekte,
 *    die diese Versionen referenzierten. Wer ein Dokument endgültig aus dem
 *    Papierkorb entfernt, MUSS zuerst documents-upload.ts::purgeDocumentForever()
 *    aufrufen (räumt Storage auf, ruft diese Funktion danach selbst auf).
 *    `doc_folders` hat keine explizite ON-DELETE-Regel auf `documents.folder_id`
 *    (also RESTRICT) -- ein Ordner lässt sich erst endgültig löschen, wenn
 *    seine Dokumente schon weg sind.
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type VersionState = 'current' | 'superseded' | 'proposal' | 'rejected';
export type UploadMode = 'original' | 'foto';
export type DocSource = 'upload' | 'generated';
export type ProfileRole = 'owner' | 'editor' | 'member';
export type TaskStatus = 'open' | 'done';
export type MentionTargetType = 'person' | 'document' | 'version';

export interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  upload_mode: UploadMode;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface DocumentRow {
  id: string;
  folder_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  /** Von Datenbank-Triggern gepflegt -- hier nie direkt setzen. */
  last_activity_at: string;
}

/** Ergebnis von listDocuments()/getDocument(): Dokument plus seine current-Version. */
export interface DocumentWithCurrentVersion extends DocumentRow {
  currentVersion: VersionRow | null;
}

export interface VersionRow {
  id: string;
  document_id: string;
  state: VersionState;
  version_no: number | null;
  targets_id: string | null;
  storage_provider: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  checksum: string | null;
  preview_path: string | null;
  preview_byte_size: number | null;
  source: DocSource;
  source_payload: unknown | null;
  note: string;
  uploaded_by: string;
  uploaded_at: string;
  decided_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  initials: string;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
}

export interface CommentRow {
  id: string;
  document_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface MentionRow {
  id: string;
  comment_id: string;
  target_type: MentionTargetType;
  target_user_id: string | null;
  target_document_id: string | null;
  target_version_id: string | null;
}

export interface TaskRow {
  id: string;
  document_id: string;
  comment_id: string | null;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_by: string;
  created_at: string;
  done_at: string | null;
  done_by: string | null;
}

export interface ReadRow {
  user_id: string;
  document_id: string;
  last_read_at: string;
}

/** Eingabe für publishVersion()/submitProposal() -- siehe Entscheidung 1 oben. */
export interface NewVersionInput {
  documentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksum: string | null;
  previewPath: string | null;
  previewByteSize: number | null;
  note?: string;
  source?: DocSource;
  sourcePayload?: unknown;
  /** Türöffner für Cloudflare R2 später (Plan Abschnitt 7); Vorgabe 'supabase'. */
  storageProvider?: string;
}

// ---------------------------------------------------------------------------
// Geteilte Hilfsmittel -- Muster von store.ts
// ---------------------------------------------------------------------------

/**
 * Der Client kennt kein generiertes `Database`-Typargument, deshalb kollidiert
 * die Spaltenprüfung von supabase-js mit unserem `Partial<T>`. Welche Spalten
 * gültig sind, prüft ohnehin Postgres -- an dieser einen Stelle wird die
 * Prüfung darum bewusst umgangen, statt überall `any` zu streuen.
 */
function columns<T>(patch: Partial<T>): never {
  return patch as never;
}

/**
 * Führt einen Schreibvorgang aus und wiederholt ihn nach erfolgreicher
 * Neuanmeldung genau einmal. Bricht die Nutzerin den Dialog ab, kommt ein
 * erkennbarer Fehler zurück -- der Aufrufer lässt das Formular dann einfach
 * stehen, damit nichts verloren geht. Exportiert (anders als in store.ts),
 * weil documents-upload.ts eigene Schreibvorgänge (Storage-Upload/-Löschen)
 * mit demselben Muster absichern muss.
 */
export async function withSession<R>(run: () => Promise<R>): Promise<R> {
  if (!(await hasValidSession())) {
    const ok = await reauthDialog();
    if (!ok) throw sessionCancelledError();
  }
  return run();
}

/** Wirft die Supabase-Meldung als bereits übersetzten Satz weiter. */
export function fail(error: unknown): never {
  const human = humanError(error);
  const err = new Error(human.message);
  if (human.detail) err.cause = human.detail;
  throw err;
}

/**
 * Wie fail(), aber für RPC-Aufrufe: die SQL-Funktionen (doc_accept_proposal,
 * doc_reactivate_version, ...) werfen bei ungültigen Übergängen bereits
 * fertige, spanischsprachige Meldungen ("diese Version ist schon aktuell"
 * o.ä.) per `RAISE EXCEPTION` -- SQLSTATE P0001. humanError() kennt diesen
 * generischen Fall nicht und würde ihn auf den Fallback-Satz "Algo no salió
 * bien..." reduzieren; hier wird die eigene Meldung stattdessen unverändert
 * durchgereicht. Alles andere (Sitzung abgelaufen, keine Rechte, Netzfehler
 * usw.) läuft weiterhin durch fail()/humanError().
 */
function failRpc(error: unknown): never {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown };
    if (e.code === 'P0001' && typeof e.message === 'string' && e.message.trim()) {
      throw new Error(e.message);
    }
  }
  fail(error);
}

/** Nutzer-ID der laufenden Sitzung, oder null ohne Sitzung. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** RPC-Aufrufe geben je nach PostgREST-Konfiguration eine Zeile oder ein
 *  einelementiges Array zurück -- beides hier vereinheitlicht. */
function unwrapRow<T>(data: unknown): T {
  return (Array.isArray(data) ? data[0] : data) as T;
}

// ---------------------------------------------------------------------------
// Ordner
// ---------------------------------------------------------------------------

/** Ordner einer Ebene, ohne Gelöschte -- sortiert für die Anzeige. */
export async function listFolders(parentId: string | null = null): Promise<FolderRow[]> {
  let query = supabase
    .from('doc_folders')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
  const { data, error } = await query;
  if (error) fail(error);
  return (data ?? []) as FolderRow[];
}

export async function createFolder(
  name: string,
  opts: { parentId?: string | null; uploadMode?: UploadMode } = {},
): Promise<FolderRow> {
  return withSession(async () => {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('doc_folders')
      .insert(
        columns<FolderRow>({
          name,
          parent_id: opts.parentId ?? null,
          // Voreinstellung 'original' -- der sichere Standard, siehe Plan Abschnitt 7.
          upload_mode: opts.uploadMode ?? 'original',
          created_by: uid,
        }),
      )
      .select()
      .single();
    if (error) fail(error);
    return data as FolderRow;
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('doc_folders').update(columns<FolderRow>({ name })).eq('id', id);
    if (error) fail(error);
  });
}

export async function setFolderUploadMode(id: string, mode: UploadMode): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('doc_folders')
      .update(columns<FolderRow>({ upload_mode: mode }))
      .eq('id', id);
    if (error) fail(error);
  });
}

/** Genau ein UPDATE mit einem von fractionalOrder() (sortable.ts) berechneten Wert. */
export async function setFolderSortOrder(id: string, value: number): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('doc_folders')
      .update(columns<FolderRow>({ sort_order: value }))
      .eq('id', id);
    if (error) fail(error);
  });
}

export async function trashFolder(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('doc_folders')
      .update(columns<FolderRow>({ deleted_at: new Date().toISOString() }))
      .eq('id', id);
    if (error) fail(error);
  });
}

export async function restoreFolder(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('doc_folders')
      .update(columns<FolderRow>({ deleted_at: null }))
      .eq('id', id);
    if (error) fail(error);
  });
}

/**
 * Löscht NUR die Datenbankzeile. Schlägt mit einer Fremdschlüssel-Meldung
 * fehl, solange der Ordner noch (auch gelöschte) Dokumente enthält -- siehe
 * Entscheidung 6 im Dateikopf. Die Oberfläche muss die Dokumente vorher
 * endgültig entfernen (documents-upload.ts::purgeDocumentForever()).
 */
export async function deleteFolderForever(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('doc_folders').delete().eq('id', id);
    if (error) fail(error);
  });
}

// ---------------------------------------------------------------------------
// Dokumente
// ---------------------------------------------------------------------------

/**
 * Dokumente eines Ordners, ohne Gelöschte, mit ihrer jeweils aktuellen
 * Version. Zwei Abfragen statt einer PostgREST-Verknüpfung -- siehe
 * Entscheidung 5 im Dateikopf.
 */
export async function listDocuments(folderId: string): Promise<DocumentWithCurrentVersion[]> {
  const { data: docs, error } = await supabase
    .from('documents')
    .select('*')
    .eq('folder_id', folderId)
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false });
  if (error) fail(error);

  const rows = (docs ?? []) as DocumentRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((d) => d.id);
  const { data: versions, error: versionsError } = await supabase
    .from('doc_versions')
    .select('*')
    .in('document_id', ids)
    .eq('state', 'current');
  if (versionsError) fail(versionsError);

  const byDocument = new Map<string, VersionRow>();
  for (const v of (versions ?? []) as VersionRow[]) byDocument.set(v.document_id, v);

  return rows.map((doc) => ({ ...doc, currentVersion: byDocument.get(doc.id) ?? null }));
}

export async function getDocument(id: string): Promise<DocumentWithCurrentVersion | null> {
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;

  const { data: versionData, error: versionError } = await supabase
    .from('doc_versions')
    .select('*')
    .eq('document_id', id)
    .eq('state', 'current')
    .maybeSingle();
  if (versionError) fail(versionError);

  return { ...(data as DocumentRow), currentVersion: (versionData as VersionRow | null) ?? null };
}

/**
 * Legt nur die Dokumentzeile an, OHNE Version. documents-upload.ts ruft dies
 * auf und veröffentlicht direkt danach die erste Version (publishVersion) --
 * ein Dokument ohne jede Version ist ein Zwischenzustand, kein Endzustand.
 */
export async function createDocument(folderId: string, title: string): Promise<DocumentRow> {
  return withSession(async () => {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('documents')
      .insert(columns<DocumentRow>({ folder_id: folderId, title, created_by: uid }))
      .select()
      .single();
    if (error) fail(error);
    return data as DocumentRow;
  });
}

export async function renameDocument(id: string, title: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('documents').update(columns<DocumentRow>({ title })).eq('id', id);
    if (error) fail(error);
  });
}

export async function trashDocument(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('documents')
      .update(columns<DocumentRow>({ deleted_at: new Date().toISOString() }))
      .eq('id', id);
    if (error) fail(error);
  });
}

export async function restoreDocument(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase
      .from('documents')
      .update(columns<DocumentRow>({ deleted_at: null }))
      .eq('id', id);
    if (error) fail(error);
  });
}

/**
 * Löscht NUR die Datenbankzeile (die Kaskade auf doc_versions räumt deren
 * Zeilen mit auf). Storage-Objekte bleiben dabei liegen -- siehe Entscheidung
 * 6 im Dateikopf. Vor dem Aufruf hier IMMER
 * documents-upload.ts::purgeDocumentForever() benutzen, nicht diese Funktion
 * direkt, außer es ist bereits sicher, dass keine Version existiert.
 */
export async function deleteDocumentForever(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) fail(error);
  });
}

// ---------------------------------------------------------------------------
// Versionen
// ---------------------------------------------------------------------------

/**
 * Alle Versionen eines Dokuments -- aktuelle, abgelöste, Vorschläge und
 * abgelehnte. Sortierung: die aktuelle zuerst, danach der Rest nach
 * Upload-Zeitpunkt absteigend (neueste zuerst).
 */
export async function listVersions(documentId: string): Promise<VersionRow[]> {
  const { data, error } = await supabase.from('doc_versions').select('*').eq('document_id', documentId);
  if (error) fail(error);
  const rows = (data ?? []) as VersionRow[];
  rows.sort((a, b) => {
    if (a.state === 'current' && b.state !== 'current') return -1;
    if (b.state === 'current' && a.state !== 'current') return 1;
    return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
  });
  return rows;
}

export async function getVersion(id: string): Promise<VersionRow | null> {
  const { data, error } = await supabase.from('doc_versions').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  return (data as VersionRow | null) ?? null;
}

/** Ein Eintrag aus der View doc_activity -- siehe 003_documentos.sql, Abschnitt 5. */
export interface ActivityRow {
  event_id: string;
  document_id: string;
  kind: 'version' | 'comment' | 'task';
  at: string;
  actor_id: string;
  version_id: string | null;
  state: string | null;
  summary: string;
}

/**
 * Chronologische Zeitleiste eines Dokuments (Versionen, Kommentare, Aufgaben
 * in einer Liste, aufsteigend sortiert) -- Grundlage für den aufklappbaren
 * "Ver historial" je Version in document-detail.ts (Plan Abschnitt 4.4 und
 * Phase 3, letzter Punkt). Die View selbst prüft keine eigenen Rechte --
 * RLS der zugrundeliegenden Tabellen (doc_versions/doc_comments/doc_tasks)
 * gilt unverändert weiter, weil Postgres-Views standardmäßig mit den
 * Rechten der abfragenden Person laufen (security invoker), nicht mit denen
 * der Person, die die View angelegt hat.
 */
export async function listActivityForDocument(documentId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('doc_activity')
    .select('*')
    .eq('document_id', documentId)
    .order('at', { ascending: true });
  if (error) fail(error);
  return (data ?? []) as ActivityRow[];
}

/**
 * Dedup-Suche über die Prüfsumme (global, nicht nur im selben Dokument --
 * dieselbe Druckdatei kann in zwei verschiedenen Dokumenten auftauchen und
 * soll trotzdem nur einmal im Speicher liegen). Die jüngste Übereinstimmung
 * gewinnt; das ist unerheblich, weil alle Treffer denselben storage_path
 * tragen müssen.
 */
export async function findVersionByChecksum(checksum: string): Promise<VersionRow | null> {
  const { data, error } = await supabase
    .from('doc_versions')
    .select('*')
    .eq('checksum', checksum)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error);
  return (data as VersionRow | null) ?? null;
}

async function countReferencing(
  column: 'storage_path' | 'preview_path',
  path: string,
  excludeVersionId?: string,
): Promise<number> {
  let query = supabase
    .from('doc_versions')
    .select('id', { count: 'exact', head: true })
    .eq(column, path);
  if (excludeVersionId) query = query.neq('id', excludeVersionId);
  const { count, error } = await query;
  if (error) fail(error);
  return count ?? 0;
}

/**
 * Wie viele Versionszeilen (irgendeines Dokuments) noch auf dieses Original
 * zeigen. Wegen Deduplizierung und Reaktivieren kann das mehr als eine sein
 * -- documents-upload.ts darf das Storage-Objekt erst löschen, wenn dieser
 * Wert (nach Ausschluss der gerade zu löschenden Zeile) 0 ist.
 */
export async function countVersionsWithStoragePath(path: string, excludeVersionId?: string): Promise<number> {
  return countReferencing('storage_path', path, excludeVersionId);
}

/** Dasselbe für das Vorschaubild -- eigener Pfad, eigene Zählung. */
export async function countVersionsWithPreviewPath(path: string, excludeVersionId?: string): Promise<number> {
  return countReferencing('preview_path', path, excludeVersionId);
}

// ---------------------------------------------------------------------------
// Zustandsübergänge (RPC) -- siehe Entscheidung 1 im Dateikopf
// ---------------------------------------------------------------------------

function versionRpcParams(input: NewVersionInput): Record<string, unknown> {
  return {
    p_document_id: input.documentId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_checksum: input.checksum,
    p_preview_path: input.previewPath,
    p_preview_byte_size: input.previewByteSize,
    p_source: input.source ?? 'upload',
    p_source_payload: input.sourcePayload ?? null,
    p_note: input.note ?? '',
    p_storage_provider: input.storageProvider ?? 'supabase',
  };
}

/** Direkt-Upload ohne Abstimmung: neue Zeile sofort `current`. */
export async function publishVersion(input: NewVersionInput): Promise<VersionRow> {
  return withSession(async () => {
    const { data, error } = await supabase.rpc('doc_publish_version', versionRpcParams(input));
    if (error) failRpc(error);
    return unwrapRow<VersionRow>(data);
  });
}

/** Datei hoch -> `proposal`, wartet auf Abstimmung (Phase 2). */
export async function submitProposal(input: NewVersionInput): Promise<VersionRow> {
  return withSession(async () => {
    const { data, error } = await supabase.rpc('doc_submit_proposal', versionRpcParams(input));
    if (error) failRpc(error);
    return unwrapRow<VersionRow>(data);
  });
}

/** `proposal` -> `current` mit nächster Nummer; bisherige aktuelle -> `superseded`. */
export async function acceptProposal(versionId: string): Promise<VersionRow> {
  return withSession(async () => {
    const { data, error } = await supabase.rpc('doc_accept_proposal', { p_version_id: versionId });
    if (error) failRpc(error);
    return unwrapRow<VersionRow>(data);
  });
}

/** `proposal` -> `rejected` mit Begründung. */
export async function rejectProposal(versionId: string, reason: string): Promise<VersionRow> {
  return withSession(async () => {
    const { data, error } = await supabase.rpc('doc_reject_proposal', {
      p_version_id: versionId,
      p_reason: reason,
    });
    if (error) failRpc(error);
    return unwrapRow<VersionRow>(data);
  });
}

/**
 * Neue Zeile mit demselben storage_path wie `versionId` -> `current`. Spult
 * die Historie nie zurück, sondern erzeugt eine neue Version -- siehe Plan
 * Abschnitt 4.2. Weist laut SQL-Funktion zurück, wenn die Zielversion schon
 * `current` oder noch ein unentschiedener `proposal` ist -- failRpc() reicht
 * diese (bereits spanische) Meldung unverändert an die Oberfläche durch.
 */
export async function reactivateVersion(versionId: string): Promise<VersionRow> {
  return withSession(async () => {
    const { data, error } = await supabase.rpc('doc_reactivate_version', { p_version_id: versionId });
    if (error) failRpc(error);
    return unwrapRow<VersionRow>(data);
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Alle Profile (aktiv und deaktiviert) -- für Anzeigenamen, Avatare, @-Menüs. */
export async function listProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name', { ascending: true });
  if (error) fail(error);
  return (data ?? []) as ProfileRow[];
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) fail(error);
  return (data as ProfileRow | null) ?? null;
}

/** Das eigene Profil, oder null ohne Sitzung. */
export async function currentProfile(): Promise<ProfileRow | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  return getProfile(uid);
}

/** Die eigene Rolle -- für "darf ich das überhaupt sehen/tun" in der Oberfläche. */
export async function currentRole(): Promise<ProfileRole | null> {
  const profile = await currentProfile();
  return profile?.role ?? null;
}

// ---------------------------------------------------------------------------
// Papierkorb
// ---------------------------------------------------------------------------

/** Zuletzt gelöschte zuerst. */
export async function listTrashedFolders(): Promise<FolderRow[]> {
  const { data, error } = await supabase
    .from('doc_folders')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as FolderRow[];
}

export async function listTrashedDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as DocumentRow[];
}
