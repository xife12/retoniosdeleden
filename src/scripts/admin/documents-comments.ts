import { supabase } from '../../lib/supabase';
import { fail, withSession, type CommentRow, type MentionRow, type MentionTargetType } from './documents-store';
import { parseMentions } from './mentions';

/**
 * Datenzugriff für Kommentare der Dokumentenablage (#/documentos) -- im
 * Muster von documents-store.ts (withSession()/fail() werden von dort
 * importiert und wiederverwendet, kein eigenes Fehlerbehandlungsmuster).
 * Tabellen `doc_comments`/`doc_mentions` sind in
 * supabase/migrations/003_documentos.sql fertig; es gibt dafür KEINE RPC,
 * anders als bei doc_versions -- Schreibvorgänge laufen direkt per
 * insert()/update()/delete(), RLS (is_active_member()) regelt den Zugriff.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (für document-detail.ts, baut ein anderer Agent)
 * ============================================================================
 *
 *   listComments(documentId: string): Promise<CommentRow[]>
 *     -- chronologisch aufsteigend (älteste zuerst).
 *
 *   createComment(documentId: string, body: string): Promise<CommentRow>
 *     -- legt den Kommentar an (author_id aus der laufenden Sitzung, siehe
 *        Entscheidung 1) UND die zu den Platzhaltern in `body` passenden
 *        doc_mentions-Zeilen (siehe mentions.ts für das Platzhalter-Format
 *        @[Label](typ:uuid)).
 *
 *   updateComment(commentId: string, body: string): Promise<CommentRow>
 *     -- setzt edited_at, ersetzt die doc_mentions-Zeilen komplett
 *        (alte gelöscht, neue aus dem geänderten Text angelegt).
 *
 *   deleteComment(commentId: string): Promise<void>
 *     -- doc_mentions-Zeilen räumt Postgres per ON DELETE CASCADE selbst auf.
 *
 *   mentionsForVersion(versionId: string): Promise<Array<{ comment: CommentRow; documentId: string }>>
 *     -- Rückverweis für "erwähnt im Kommentar von …" bei der Zielversion
 *        (Plan Phase 3, dritter Punkt): alle Kommentare, die GENAU DIESE
 *        Version erwähnen, chronologisch aufsteigend. `documentId` ist
 *        bequemlichkeitshalber herausgezogen (== comment.document_id),
 *        damit die Aufrufseite ohne Umweg zum Dokument verlinken kann.
 *
 * Wiederverwendet, nicht neu definiert: CommentRow, MentionRow,
 * MentionTargetType (alle aus documents-store.ts).
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. author_id kommt NICHT server-seitig automatisch (keine RPC, kein
 *    `default auth.uid()` in der Migration) -- wird hier per
 *    supabase.auth.getUser() aus der laufenden Sitzung gelesen und explizit
 *    mitgeschickt, wie im Auftrag vorgegeben. Ohne gültigen Nutzer wirft
 *    currentUserId() über fail() einen übersetzten Fehler, statt author_id
 *    stillschweigend leer zu lassen.
 *
 * 2. updateComment() gleicht die Erwähnungen NICHT ab, sondern löscht alle
 *    bestehenden doc_mentions-Zeilen des Kommentars und legt sie aus dem
 *    neuen Text komplett neu an. Einfacher und robuster als ein Diff bei
 *    dieser Datenmenge (Kommentare pro Dokument, nicht Zeilen in einer
 *    großen Tabelle) -- und die Zeilen tragen ohnehin keine eigene
 *    Bedeutung außerhalb des Kommentartexts, aus dem sie stammen.
 *
 * 3. Mehrfachnennung DESSELBEN Ziels im selben Kommentartext (z. B. dieselbe
 *    Person zweimal erwähnt) erzeugt bewusst nur EINE doc_mentions-Zeile --
 *    dedupliziert vor dem Insert. Doppelte Zeilen brächten für
 *    mentionsForVersion() und künftige "wer wurde erwähnt"-Auswertungen
 *    keinen Zusatznutzen, nur Zählfehler.
 *
 * 4. mentionsForVersion() filtert zusätzlich auf target_type = 'version'
 *    (nicht nur target_version_id = versionId) -- rein defensiv, weil laut
 *    Migrationskommentar "genau eines der drei target_*-Felder gesetzt" eine
 *    Invariante ist, die die Datenbank nicht per Constraint erzwingt.
 * ============================================================================
 */

/**
 * Wie columns() in documents-store.ts (dort nicht exportiert): der Client
 * kennt kein generiertes Database-Typargument, deshalb kollidiert die
 * Spaltenprüfung von supabase-js mit unserem Partial<T>. Postgres prüft die
 * Spalten ohnehin.
 */
function columns<T>(patch: Partial<T> | Partial<T>[]): never {
  return patch as never;
}

/**
 * Nutzer-ID der laufenden Sitzung -- per supabase.auth.getUser(), wie im
 * Auftrag vorgegeben (documents-store.ts liest an anderer Stelle mit
 * getSession(); hier ausdrücklich getUser(), weil author_id serverseitig
 * nirgends gesetzt wird und deshalb aus einer frisch geprüften Sitzung
 * stammen soll). Ohne Sitzung/Nutzer wirft fail() den passenden,
 * spanischsprachigen Fehler.
 */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    fail(error ?? new Error('No hay una sesión activa.'));
  }
  return data.user!.id;
}

// ---------------------------------------------------------------------------
// Erwähnungen aus Kommentartext -- geteilte Hilfsfunktion für
// createComment()/updateComment()
// ---------------------------------------------------------------------------

function dedupeMentions(
  mentions: { type: MentionTargetType; id: string }[],
): { type: MentionTargetType; id: string }[] {
  const seen = new Set<string>();
  const result: { type: MentionTargetType; id: string }[] = [];
  for (const m of mentions) {
    const key = `${m.type}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  return result;
}

function buildMentionRow(commentId: string, mention: { type: MentionTargetType; id: string }): Partial<MentionRow> {
  const base: Partial<MentionRow> = { comment_id: commentId, target_type: mention.type };
  switch (mention.type) {
    case 'person':
      return { ...base, target_user_id: mention.id };
    case 'document':
      return { ...base, target_document_id: mention.id };
    case 'version':
      return { ...base, target_version_id: mention.id };
  }
}

/** Legt die doc_mentions-Zeilen für die Platzhalter in `body` an. Tut nichts, wenn keine da sind. */
async function insertMentionRows(commentId: string, body: string): Promise<void> {
  const mentions = dedupeMentions(parseMentions(body));
  if (mentions.length === 0) return;

  const rows = mentions.map((m) => buildMentionRow(commentId, m));
  const { error } = await supabase.from('doc_mentions').insert(columns<MentionRow>(rows));
  if (error) fail(error);
}

// ---------------------------------------------------------------------------
// Kommentare
// ---------------------------------------------------------------------------

/** Kommentare eines Dokuments, chronologisch aufsteigend (älteste zuerst). */
export async function listComments(documentId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('doc_comments')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
  if (error) fail(error);
  return (data ?? []) as CommentRow[];
}

/** Legt den Kommentar UND die passenden doc_mentions-Zeilen an. */
export async function createComment(documentId: string, body: string): Promise<CommentRow> {
  return withSession(async () => {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('doc_comments')
      .insert(columns<CommentRow>({ document_id: documentId, author_id: uid, body }))
      .select()
      .single();
    if (error) fail(error);
    const comment = data as CommentRow;

    await insertMentionRows(comment.id, body);

    return comment;
  });
}

/** Setzt edited_at, ersetzt die doc_mentions-Zeilen komplett -- siehe Entscheidung 2 im Dateikopf. */
export async function updateComment(commentId: string, body: string): Promise<CommentRow> {
  return withSession(async () => {
    const { data, error } = await supabase
      .from('doc_comments')
      .update(columns<CommentRow>({ body, edited_at: new Date().toISOString() }))
      .eq('id', commentId)
      .select()
      .single();
    if (error) fail(error);
    const comment = data as CommentRow;

    const { error: deleteError } = await supabase.from('doc_mentions').delete().eq('comment_id', commentId);
    if (deleteError) fail(deleteError);
    await insertMentionRows(commentId, body);

    return comment;
  });
}

/** doc_mentions-Zeilen räumt Postgres per ON DELETE CASCADE selbst auf. */
export async function deleteComment(commentId: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('doc_comments').delete().eq('id', commentId);
    if (error) fail(error);
  });
}

/**
 * Rückverweis für "erwähnt im Kommentar von …" bei der Zielversion: alle
 * Kommentare, die GENAU DIESE Version erwähnen, chronologisch aufsteigend.
 */
export async function mentionsForVersion(
  versionId: string,
): Promise<Array<{ comment: CommentRow; documentId: string }>> {
  const { data: mentionRows, error } = await supabase
    .from('doc_mentions')
    .select('comment_id')
    .eq('target_type', 'version')
    .eq('target_version_id', versionId);
  if (error) fail(error);

  const commentIds = Array.from(new Set(((mentionRows ?? []) as { comment_id: string }[]).map((m) => m.comment_id)));
  if (commentIds.length === 0) return [];

  const { data: comments, error: commentsError } = await supabase
    .from('doc_comments')
    .select('*')
    .in('id', commentIds)
    .order('created_at', { ascending: true });
  if (commentsError) fail(commentsError);

  return ((comments ?? []) as CommentRow[]).map((comment) => ({ comment, documentId: comment.document_id }));
}
