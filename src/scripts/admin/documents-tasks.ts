import { supabase } from '../../lib/supabase';
import { withSession, fail, type TaskRow, type CommentRow } from './documents-store';

/**
 * Datenzugriff für Aufgaben der Dokumentenablage (#/documentos, Phase 4 aus
 * PLAN-DOCUMENTOS.md). `doc_tasks` hat KEINE eigene RPC -- die RLS-Policy
 * `doc_tasks_active_members` (Migration 003, ~Zeile 671) erlaubt jedem
 * aktiven Mitglied insert/update/select/delete direkt, siehe dort. Stil und
 * Hilfsmittel (withSession(), fail(), TaskRow) folgen documents-store.ts
 * wörtlich -- dort auch nachlesen für die ausführliche Begründung.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (für den UI-Agenten, der direkt danach die
 * Dokument-Detail-Ansicht, die ausklappbare Ordner-Aufgabenliste und
 * #/documentos/tareas baut)
 * ============================================================================
 *
 *   listTasksForDocument(documentId: string): Promise<TaskRow[]>
 *     -- Aufgaben EINES Dokuments. Offene zuerst, dann erledigte; innerhalb
 *        jeder Gruppe nach Fälligkeit aufsteigend (ohne Fälligkeitsdatum ans
 *        Ende der jeweiligen Gruppe).
 *
 *   listOpenTasksForFolder(folderId: string):
 *     Promise<Array<TaskRow & { documentId: string; documentTitle: string }>>
 *     -- Alle OFFENEN Aufgaben aller (nicht gelöschten) Dokumente EINES
 *        Ordners, für die ausklappbare Aufgabenübersicht auf Ordnerebene.
 *        Zwei Abfragen (siehe Entscheidung 1 unten), sortiert nach
 *        Fälligkeit aufsteigend, ohne Datum ans Ende.
 *
 *   listMyOpenTasks():
 *     Promise<Array<TaskRow & {
 *       documentId: string; documentTitle: string;
 *       folderId: string; folderName: string;
 *     }>>
 *     -- ALLE offenen Aufgaben der angemeldeten Person, ordnerübergreifend,
 *        für die Ansicht "Meine Aufgaben" (#/documentos/tareas). Drei
 *        Abfragen (siehe Entscheidung 1 unten). Sortiert nach Fälligkeit
 *        aufsteigend, Aufgaben ohne Fälligkeitsdatum ans Ende. Ohne Sitzung:
 *        leeres Array.
 *
 *   createTask(input: {
 *     documentId: string; title: string;
 *     assigneeId?: string; dueDate?: string; commentId?: string;
 *   }): Promise<TaskRow>
 *     -- Legt eine neue Aufgabe an. created_by kommt NIE vom Aufrufer,
 *        sondern wird hier aus der laufenden Sitzung gesetzt (Entscheidung 2).
 *
 *   createTaskFromComment(
 *     comment: CommentRow, title: string,
 *     assigneeId?: string, dueDate?: string,
 *   ): Promise<TaskRow>
 *     -- "Kommentar in Aufgabe umwandeln": ruft createTask() mit
 *        comment.document_id und comment.id als commentId auf, damit die
 *        Herkunft nachvollziehbar bleibt.
 *
 *   markTaskDone(taskId: string): Promise<TaskRow>
 *     -- status='done', done_at=jetzt, done_by=eigene User-ID.
 *
 *   reopenTask(taskId: string): Promise<TaskRow>
 *     -- macht markTaskDone() rückgängig: status='open', done_at=null,
 *        done_by=null.
 *
 *   updateTask(taskId: string, changes: {
 *     title?: string; assigneeId?: string | null; dueDate?: string | null;
 *   }): Promise<TaskRow>
 *     -- Teil-Update. `undefined` lässt ein Feld unverändert, `null` löscht
 *        assignee_id/due_date explizit (beide sind laut Datenbank nullable;
 *        siehe Entscheidung 3 unten).
 *
 *   deleteTask(taskId: string): Promise<void>
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. Ordner-Zuordnung über zwei bzw. drei getrennte Abfragen, keine
 *    PostgREST-Fremdschlüssel-Verknüpfung (`select('*, documents(...)')`):
 *    `doc_tasks` hat keine `folder_id`, der Weg zum Ordner führt über
 *    `documents.folder_id`. listOpenTasksForFolder() holt darum zuerst die
 *    (nicht gelöschten) Dokument-IDs+Titel des Ordners, dann per `.in()` die
 *    offenen Aufgaben dieser Dokumente -- genau das im Auftrag vorgeschlagene
 *    Muster, und deckungsgleich mit Entscheidung 5 in documents-store.ts
 *    (Version zu Dokument). listMyOpenTasks() braucht zusätzlich noch den
 *    Ordnernamen, also eine dritte Abfrage: erst die eigenen offenen
 *    Aufgaben (gefiltert auf assignee_id = eigene User-ID -- läuft über den
 *    Index doc_tasks_assignee_idx), dann deren Dokumente (id, title,
 *    folder_id), dann deren Ordner (id, name). Für den erwarteten Umfang
 *    (eine Person hat selten mehr als ein paar Dutzend offene Aufgaben,
 *    Ordner sind eine kleine Menge) ist das unkritisch -- die Kosten sind
 *    drei kurze, indexierte Abfragen statt einer komplexen Verknüpfung, und
 *    die zweite/dritte Abfrage laufen leer (0ms Netzwerk-Overhead durch
 *    frühen Return), sobald die erste keine Treffer hat. WICHTIG für den
 *    UI-Agenten: listOpenTasksForFolder() so oft aufrufen, wie Ordner
 *    aufgeklappt werden (on-demand, nicht für alle Ordner auf einmal) --
 *    genau dafür ist es als Einzelabfrage pro Ordner gebaut, nicht als
 *    Batch-Funktion für mehrere Ordner gleichzeitig.
 *
 * 2. created_by/done_by kommen NIE als Parameter vom Client, sondern werden
 *    hier aus der laufenden Sitzung gelesen (currentUserId(), siehe unten) --
 *    exakt dieselbe Begründung wie bei uploaded_by/decided_by in
 *    documents-store.ts (Entscheidung 2 dort): alles andere würde erlauben,
 *    eine Aufgabe im Namen einer anderen Person anzulegen oder zu erledigen.
 *
 * 3. updateTask() erlaubt `null` für assigneeId/dueDate (zusätzlich zu
 *    `undefined` für "unverändert lassen"), obwohl der Auftrag nur `?`
 *    verlangt: beide Spalten sind in der Datenbank nullable, und ohne einen
 *    Weg, eine bereits gesetzte Zuweisung/Fälligkeit wieder zu entfernen,
 *    bräuchte die Oberfläche einen Umweg über deleteTask()+createTask().
 *
 * 4. currentUserId() ist in documents-store.ts NICHT exportiert (bewusst,
 *    siehe dessen öffentliche Schnittstelle) -- hier deshalb als eigene,
 *    identische Kopie (supabase.auth.getSession()), keine Änderung an jener
 *    Datei. `columns<T>()` (der Partial<T>-Typtrick dort) wird hier
 *    absichtlich NICHT nachgebaut: der Supabase-Client in lib/supabase.ts
 *    läuft ohne generiertes Database-Typargument, insert()/update() nehmen
 *    also ohnehin ein einfaches Objektliteral an -- der Trick löst ein
 *    Problem, das hier gar nicht auftritt.
 */

// ---------------------------------------------------------------------------
// Hilfsmittel
// ---------------------------------------------------------------------------

/** Nutzer-ID der laufenden Sitzung, oder null ohne Sitzung -- siehe Entscheidung 4. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Sortiert nach Fälligkeit aufsteigend, ohne Datum zuletzt. `due_date` ist
 * eine SQL-`date`-Spalte und kommt als 'YYYY-MM-DD'-Text zurück -- dieses
 * Format sortiert auch als reiner Stringvergleich chronologisch richtig,
 * ein Date()-Umweg ist nicht nötig.
 */
function compareDue(a: TaskRow, b: TaskRow): number {
  if (a.due_date === null && b.due_date === null) return 0;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/** Aufgaben eines Dokuments: offene zuerst, dann erledigte, je nach Fälligkeit. */
export async function listTasksForDocument(documentId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase.from('doc_tasks').select('*').eq('document_id', documentId);
  if (error) fail(error);
  const rows = (data ?? []) as TaskRow[];
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return compareDue(a, b);
  });
  return rows;
}

/**
 * Offene Aufgaben aller Dokumente EINES Ordners -- für die ausklappbare
 * Aufgabenübersicht auf Ordnerebene. Siehe Entscheidung 1 im Dateikopf.
 */
export async function listOpenTasksForFolder(
  folderId: string,
): Promise<Array<TaskRow & { documentId: string; documentTitle: string }>> {
  // Erste Abfrage: welche (nicht gelöschten) Dokumente liegen im Ordner?
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, title')
    .eq('folder_id', folderId)
    .is('deleted_at', null);
  if (docsError) fail(docsError);

  const documents = (docs ?? []) as Array<{ id: string; title: string }>;
  if (documents.length === 0) return [];

  const titleById = new Map(documents.map((d) => [d.id, d.title]));
  const documentIds = documents.map((d) => d.id);

  // Zweite Abfrage: offene Aufgaben genau dieser Dokumente.
  const { data: tasks, error: tasksError } = await supabase
    .from('doc_tasks')
    .select('*')
    .in('document_id', documentIds)
    .eq('status', 'open');
  if (tasksError) fail(tasksError);

  const rows = (tasks ?? []) as TaskRow[];
  rows.sort(compareDue);
  return rows.map((t) => ({
    ...t,
    documentId: t.document_id,
    documentTitle: titleById.get(t.document_id) ?? '',
  }));
}

/**
 * ALLE offenen Aufgaben der angemeldeten Person, ordnerübergreifend -- speist
 * die Ansicht "Meine Aufgaben" (#/documentos/tareas). Siehe Entscheidung 1 im
 * Dateikopf. Ohne Sitzung: leeres Array statt Fehler, da diese Funktion rein
 * lesend ist und keinen withSession()-Neuanmelde-Dialog auslösen soll (die
 * Ansicht soll einfach leer bleiben, wenn niemand angemeldet ist).
 */
export async function listMyOpenTasks(): Promise<
  Array<TaskRow & { documentId: string; documentTitle: string; folderId: string; folderName: string }>
> {
  const uid = await currentUserId();
  if (!uid) return [];

  // Erste Abfrage: die eigenen offenen Aufgaben (nutzt den Index doc_tasks_assignee_idx).
  const { data: tasks, error: tasksError } = await supabase
    .from('doc_tasks')
    .select('*')
    .eq('assignee_id', uid)
    .eq('status', 'open');
  if (tasksError) fail(tasksError);

  const rows = (tasks ?? []) as TaskRow[];
  if (rows.length === 0) return [];

  // Zweite Abfrage: die zugehörigen (nicht gelöschten) Dokumente samt Ordner-ID.
  const documentIds = [...new Set(rows.map((t) => t.document_id))];
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, title, folder_id')
    .in('id', documentIds)
    .is('deleted_at', null);
  if (docsError) fail(docsError);

  const documents = (docs ?? []) as Array<{ id: string; title: string; folder_id: string }>;
  const docById = new Map(documents.map((d) => [d.id, d]));

  // Dritte Abfrage: die Namen der beteiligten Ordner.
  const folderIds = [...new Set(documents.map((d) => d.folder_id))];
  const { data: folders, error: foldersError } =
    folderIds.length === 0
      ? { data: [] as Array<{ id: string; name: string }>, error: null }
      : await supabase.from('doc_folders').select('id, name').in('id', folderIds);
  if (foldersError) fail(foldersError);

  const folderById = new Map(((folders ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f]));

  rows.sort(compareDue);
  // Aufgaben, deren Dokument inzwischen im Papierkorb liegt, werden hier
  // stillschweigend ausgelassen -- "Meine Aufgaben" soll keine Aufgaben zu
  // Dokumenten zeigen, die gerade nicht mehr sichtbar/bearbeitbar sind.
  return rows
    .filter((t) => docById.has(t.document_id))
    .map((t) => {
      const doc = docById.get(t.document_id)!;
      const folder = folderById.get(doc.folder_id);
      return {
        ...t,
        documentId: t.document_id,
        documentTitle: doc.title,
        folderId: doc.folder_id,
        folderName: folder?.name ?? '',
      };
    });
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Legt eine neue Aufgabe an. created_by kommt aus der Sitzung, siehe Entscheidung 2. */
export async function createTask(input: {
  documentId: string;
  title: string;
  assigneeId?: string;
  dueDate?: string;
  commentId?: string;
}): Promise<TaskRow> {
  return withSession(async () => {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('doc_tasks')
      .insert({
        document_id: input.documentId,
        comment_id: input.commentId ?? null,
        title: input.title,
        assignee_id: input.assigneeId ?? null,
        due_date: input.dueDate ?? null,
        created_by: uid,
      })
      .select()
      .single();
    if (error) fail(error);
    return data as TaskRow;
  });
}

/**
 * "Kommentar in Aufgabe umwandeln": setzt comment_id, damit die Herkunft der
 * Aufgabe nachvollziehbar bleibt (z.B. um in der Oberfläche "aus Kommentar
 * von ..." anzuzeigen und zum ursprünglichen Kommentar zu verlinken).
 */
export async function createTaskFromComment(
  comment: CommentRow,
  title: string,
  assigneeId?: string,
  dueDate?: string,
): Promise<TaskRow> {
  return createTask({
    documentId: comment.document_id,
    title,
    assigneeId,
    dueDate,
    commentId: comment.id,
  });
}

/** Erledigt eine Aufgabe: status='done', done_at=jetzt, done_by=eigene User-ID. */
export async function markTaskDone(taskId: string): Promise<TaskRow> {
  return withSession(async () => {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('doc_tasks')
      .update({ status: 'done', done_at: new Date().toISOString(), done_by: uid })
      .eq('id', taskId)
      .select()
      .single();
    if (error) fail(error);
    return data as TaskRow;
  });
}

/** Macht markTaskDone() rückgängig -- falls sich jemand vertan hat. */
export async function reopenTask(taskId: string): Promise<TaskRow> {
  return withSession(async () => {
    const { data, error } = await supabase
      .from('doc_tasks')
      .update({ status: 'open', done_at: null, done_by: null })
      .eq('id', taskId)
      .select()
      .single();
    if (error) fail(error);
    return data as TaskRow;
  });
}

/**
 * Teil-Update von Titel, Zuweisung und/oder Fälligkeit. `undefined` lässt
 * ein Feld unverändert, `null` löscht assignee_id/due_date explizit --
 * siehe Entscheidung 3 im Dateikopf.
 */
export async function updateTask(
  taskId: string,
  changes: { title?: string; assigneeId?: string | null; dueDate?: string | null },
): Promise<TaskRow> {
  return withSession(async () => {
    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.assigneeId !== undefined) patch.assignee_id = changes.assigneeId;
    if (changes.dueDate !== undefined) patch.due_date = changes.dueDate;

    const { data, error } = await supabase.from('doc_tasks').update(patch).eq('id', taskId).select().single();
    if (error) fail(error);
    return data as TaskRow;
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('doc_tasks').delete().eq('id', taskId);
    if (error) fail(error);
  });
}
