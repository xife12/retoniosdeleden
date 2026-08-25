import { supabase } from '../../lib/supabase';
import { fail, withSession, type CommentRow } from './documents-store';

/**
 * Datenzugriff für das Chat-Modul (Phase 7, siehe PLAN-CHAT.md) -- im Muster
 * von documents-store.ts (withSession()/fail() werden von dort importiert
 * und wiederverwendet, kein eigenes Fehlerbehandlungsmuster). Der Chat
 * erfindet KEINE neuen Tabellen: Er ist laut Plan Abschnitt 1 nur eine neue
 * Oberfläche auf `doc_comments` (Nachrichten) und `doc_reads` (Gelesen-
 * Stand je Person und Dokument, Migration 003, ~Zeile 206-213 -- Tabelle
 * existiert bereits, aber bisher schreibt niemand hinein).
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (für den UI-Agenten, der direkt danach
 * chat-view.ts baut)
 * ============================================================================
 *
 *   interface ChatThread {
 *     documentId: string; documentTitle: string;
 *     folderId: string; folderName: string;
 *     lastMessage: CommentRow; unreadCount: number;
 *   }
 *
 *   listChatThreads(): Promise<ChatThread[]>
 *     -- Ein Eintrag je Dokument mit MINDESTENS EINEM Kommentar (Dokumente
 *        ohne Kommentar sind laut Plan-Konzept keine Unterhaltung und tauchen
 *        hier nicht auf -- siehe Entscheidung 1 unten). Sortiert nach
 *        lastMessage.created_at absteigend (neueste Unterhaltung zuerst).
 *        Dokumente, die inzwischen im Papierkorb liegen, werden ausgelassen.
 *
 *   markRead(documentId: string): Promise<void>
 *     -- upsert auf (user_id, document_id) mit last_read_at = jetzt. Nach dem
 *        Öffnen eines Gesprächsverlaufs aufzurufen (Plan Abschnitt 8, Punkt 4:
 *        Öffnen reicht als "gelesen", kein Scroll-Tracking).
 *
 * Wiederverwendet, nicht neu definiert: CommentRow (aus documents-store.ts).
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. Client-seitige Zusammenführung statt einer SQL-Verknüpfung/View, exakt
 *    im Stil von documents-tasks.ts::listMyOpenTasks() (dort ausführlich
 *    begründet): ALLE Kommentare (public.doc_comments, select *) in einer
 *    Abfrage laden, nach document_id gruppieren, je Gruppe den neuesten
 *    Kommentar als lastMessage merken. Bei der Datenmenge eines
 *    Familienbetriebs (eine Handvoll Mitglieder, absehbar Hunderte, nicht
 *    Zehntausende Kommentare) ist das unproblematisch und deckungsgleich mit
 *    dem Rest des Projekts (siehe auch listVersions() in documents-store.ts,
 *    das ebenfalls "alles laden, dann im Speicher sortieren/gruppieren"
 *    macht). Eine eigene SQL-View wie doc_activity wäre hier Overkill: Die
 *    Gruppierung "neuester Kommentar je Dokument" ändert sich nie, eine View
 *    würde nur denselben Rechenschritt in die Datenbank verlagern, ohne dass
 *    RLS oder Konsistenz das verlangen. KEINE Obergrenze/Seitenweise-Laden --
 *    bewusst wie überall sonst im Projekt: erst nachrüsten, wenn sich in der
 *    Praxis zeigt, dass es nötig wird (siehe Antwort im Abschlussbericht).
 *
 * 2. Dokumente OHNE jeden Kommentar erscheinen dadurch automatisch gar nicht
 *    erst in der Gruppierung -- kein zusätzlicher Filter nötig, das ist eine
 *    direkte Folge von "gruppieren nach document_id aus doc_comments" (Plan
 *    Abschnitt 1: ein Dokument OHNE Kommentare ist keine Unterhaltung).
 *
 * 3. Gelöschte Dokumente (deleted_at gesetzt) werden erst NACH der
 *    Kommentar-Gruppierung herausgefiltert, indem die Dokumente-Abfrage
 *    selbst `is('deleted_at', null)` verlangt: Ein Dokument, das im
 *    Papierkorb liegt, aber noch Kommentare hat, taucht in der
 *    documents-Abfrage einfach nicht auf -- die anschließende
 *    Zusammenführung lässt es dadurch stillschweigend aus der Thread-Liste
 *    fallen, exakt wie listMyOpenTasks() das mit `docById.has(...)` für
 *    Aufgaben zu gelöschten Dokumenten macht.
 *
 * 4. Ungelesen-Zähler wird HIER (in chat-store.ts) über die tatsächliche
 *    Kommentaranzahl berechnet (Anzahl Kommentare mit created_at >
 *    last_read_at), NICHT wie in PLAN-CHAT.md Abschnitt 4.2 skizziert über
 *    einen reinen Boolean-Vergleich von last_activity_at gegen
 *    last_read_at. Grund: der Auftrag verlangt ausdrücklich `unreadCount:
 *    number` (eine Zahl fürs Badge), nicht nur "ungelesen ja/nein" -- die
 *    Kommentare aus Schritt 1 liegen ohnehin schon geladen im Speicher, der
 *    Vergleich kostet keine zusätzliche Abfrage.
 *
 * 5. currentUserId() ist in documents-store.ts NICHT exportiert (bewusst,
 *    siehe dessen öffentliche Schnittstelle) -- hier deshalb als eigene,
 *    identische Kopie (supabase.auth.getSession()), wie es documents-
 *    tasks.ts an derselben Stelle schon vormacht. Keine Änderung an
 *    documents-store.ts.
 *
 * 6. listChatThreads() liefert ohne Sitzung ein leeres Array statt eines
 *    Fehlers (wie listMyOpenTasks()) -- reine Lesefunktion, kein Grund für
 *    einen Neuanmelde-Dialog. markRead() dagegen ist ein Schreibvorgang und
 *    läuft daher durch withSession(), wie jeder andere Schreibvorgang im
 *    Projekt.
 * ============================================================================
 */

export interface ChatThread {
  documentId: string;
  documentTitle: string;
  folderId: string;
  folderName: string;
  lastMessage: CommentRow;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Hilfsmittel
// ---------------------------------------------------------------------------

/** Nutzer-ID der laufenden Sitzung, oder null ohne Sitzung -- siehe Entscheidung 5. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Sehr altes Datum als Ersatz für "noch nie gelesen" (keine doc_reads-Zeile). */
const NEVER_READ = '1970-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Thread-Liste
// ---------------------------------------------------------------------------

/**
 * Gesprächsfäden -- ein Eintrag je Dokument mit mindestens einem Kommentar,
 * neueste Unterhaltung zuerst. Siehe Entscheidungen 1-4 im Dateikopf für die
 * Begründung der client-seitigen Zusammenführung.
 */
export async function listChatThreads(): Promise<ChatThread[]> {
  // Erste Abfrage: ALLE Kommentare -- Grundlage für Gruppierung, letzte
  // Nachricht je Dokument und Ungelesen-Zählung in einem Rutsch.
  const { data: commentsData, error: commentsError } = await supabase.from('doc_comments').select('*');
  if (commentsError) fail(commentsError);
  const comments = (commentsData ?? []) as CommentRow[];
  if (comments.length === 0) return [];

  // Gruppieren nach document_id, je Gruppe den neuesten Kommentar merken.
  // Dokumente ohne Kommentar tauchen hier gar nicht erst auf -- siehe
  // Entscheidung 2.
  const commentsByDocument = new Map<string, CommentRow[]>();
  const lastMessageByDocument = new Map<string, CommentRow>();
  for (const c of comments) {
    const list = commentsByDocument.get(c.document_id);
    if (list) list.push(c);
    else commentsByDocument.set(c.document_id, [c]);

    const current = lastMessageByDocument.get(c.document_id);
    if (!current || new Date(c.created_at).getTime() > new Date(current.created_at).getTime()) {
      lastMessageByDocument.set(c.document_id, c);
    }
  }
  const documentIds = [...commentsByDocument.keys()];

  // Zweite Abfrage: eigene Gelesen-Stände -- Map documentId -> last_read_at.
  const uid = await currentUserId();
  const readAtByDocument = new Map<string, string>();
  if (uid) {
    const { data: readsData, error: readsError } = await supabase
      .from('doc_reads')
      .select('document_id, last_read_at')
      .eq('user_id', uid);
    if (readsError) fail(readsError);
    for (const r of (readsData ?? []) as Array<{ document_id: string; last_read_at: string }>) {
      readAtByDocument.set(r.document_id, r.last_read_at);
    }
  }

  // Dritte Abfrage: die betroffenen Dokumente, ohne Gelöschte -- ein
  // gelöschtes Dokument fällt dadurch automatisch aus der Zusammenführung
  // heraus (siehe Entscheidung 3).
  const { data: docsData, error: docsError } = await supabase
    .from('documents')
    .select('id, title, folder_id, deleted_at')
    .in('id', documentIds)
    .is('deleted_at', null);
  if (docsError) fail(docsError);
  const documents = (docsData ?? []) as Array<{ id: string; title: string; folder_id: string }>;
  if (documents.length === 0) return [];

  // Vierte Abfrage: Ordnernamen der beteiligten Ordner.
  const folderIds = [...new Set(documents.map((d) => d.folder_id))];
  const { data: foldersData, error: foldersError } =
    folderIds.length === 0
      ? { data: [] as Array<{ id: string; name: string }>, error: null }
      : await supabase.from('doc_folders').select('id, name').in('id', folderIds);
  if (foldersError) fail(foldersError);
  const folderById = new Map(((foldersData ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f]));

  // Zusammenführen + Ungelesen-Zählung.
  const threads: ChatThread[] = documents.map((doc) => {
    const lastMessage = lastMessageByDocument.get(doc.id)!;
    const readAt = readAtByDocument.get(doc.id) ?? NEVER_READ;
    const readAtMs = new Date(readAt).getTime();
    const unreadCount = (commentsByDocument.get(doc.id) ?? []).filter(
      (c) => new Date(c.created_at).getTime() > readAtMs,
    ).length;

    return {
      documentId: doc.id,
      documentTitle: doc.title,
      folderId: doc.folder_id,
      folderName: folderById.get(doc.folder_id)?.name ?? '',
      lastMessage,
      unreadCount,
    };
  });

  threads.sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());
  return threads;
}

// ---------------------------------------------------------------------------
// Gelesen-Stand
// ---------------------------------------------------------------------------

/**
 * Markiert ein Dokument als (gerade eben) gelesen -- upsert auf
 * (user_id, document_id), siehe Entscheidung 6. Keine RPC vorhanden (wie bei
 * doc_comments/doc_tasks): RLS auf doc_reads regelt den Zugriff direkt.
 */
export async function markRead(documentId: string): Promise<void> {
  return withSession(async () => {
    const uid = await currentUserId();
    if (!uid) fail(new Error('No hay una sesión activa.'));
    const { error } = await supabase
      .from('doc_reads')
      .upsert(
        { user_id: uid, document_id: documentId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,document_id' },
      );
    if (error) fail(error);
  });
}
