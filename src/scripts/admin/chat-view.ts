import { listChatThreads, markRead, type ChatThread } from './chat-store';
import { createComment, listComments } from './documents-comments';
import {
  acceptProposal,
  currentProfile,
  getDocument,
  listProfiles,
  listVersions,
  rejectProposal,
  type CommentRow,
  type DocumentWithCurrentVersion,
  type ProfileRow,
  type TaskRow,
  type UploadMode,
  type VersionRow,
} from './documents-store';
import { getOriginalUrl, getThumbnailUrl, previewKindFor, shouldAutoload } from './documents-preview';
import { createTask, createTaskFromComment, listTasksForDocument, markTaskDone, reopenTask } from './documents-tasks';
import { MAX_UPLOAD_BYTES, publishNewVersion, submitVersionProposal } from './documents-upload';
import { attachMentionInput } from './mention-input';
import { renderCommentBody } from './mentions';
import { humanError, isSessionCancelled } from './errors';
import { navigate } from './router';
import { toast } from './toast';
import '../../styles/admin/chat.css';

/**
 * Chat-Oberfläche (Phase 7a, #/documentos/chat) -- baut auf den fertigen
 * Datenschichten chat-store.ts (Gesprächsliste, Gelesen-Stand) und
 * documents-comments.ts (Nachrichten = Kommentare, `createComment()` ist
 * "senden") auf. Kein neuer Datenzugriff hier, nur Oberfläche -- siehe
 * PLAN-CHAT.md Abschnitt 6/7a und das vom Nutzer freigegebene Mockup.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (von documents-view.ts benutzt, dort bereits
 * verdrahtet)
 * ============================================================================
 *
 *   mountChat(container: HTMLElement, opts?: MountChatOptions): Promise<void>
 *   unmountChat(): void
 *
 *   `opts.onOpenDocument` ist NUR für die eigenständige Chat-App gedacht
 *   (Phase 7c, PLAN-CHAT.md Abschnitt 5/7c, /chat): dort gibt es den
 *   #/...-Hash-Router aus router.ts nicht, ein bare navigate() dorthin
 *   würde nur den URL-Hash ändern, ohne dass jemand reagiert. Ruft man
 *   mountChat() OHNE zweites Argument auf (wie documents-view.ts es
 *   innerhalb von /admin unverändert weiter tut), bleibt das Verhalten exakt
 *   wie bisher: intern weiterhin navigate({ view: 'documento', id }) über
 *   goToDocument() weiter unten. Betrifft nicht nur die zwei im Auftrag
 *   genannten Stellen (Kopfzeilen-Knopf, Dokument-Erwähnungs-Chip), sondern
 *   aus Konsistenz auch den dritten, selteneren Fall: den Rückfall in
 *   onVersionClick, wenn eine referenzierte Version nicht mehr in
 *   `activeVersions` auftaucht -- auch der würde in /chat sonst ins Leere
 *   laufen.
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DAS MOCKUP/DER AUFTRAG OFFENLIESS:
 *
 * 1. Liste <-> Konversation ist ein rein interner Zustand dieser einen
 *    mountChat()-Instanz (ein wiederverwendeter `body`-Container, den
 *    showList()/openThread() austauschen) -- KEIN Router-Wechsel, wie im
 *    Mockup ausdrücklich vorgegeben ("‹ Volver" ist kein history.back()).
 *    Nur "Ver documento →" verlässt den Chat über das normale navigate().
 *
 * 2. Eigene vs. fremde Nachricht: über currentProfile() (documents-store.ts)
 *    -- dieselbe Funktion, die document-detail.ts für ownUserId benutzt.
 *    createComment() selbst liest die Autor-ID separat aus der Sitzung
 *    (documents-comments.ts, eigene currentUserId()); hier reicht ein
 *    einmaliger Abgleich beim Mounten, ein Wechsel der eigenen Identität
 *    mitten in einer offenen Sitzung ist kein Fall, den die übrige Ablage
 *    behandelt.
 *
 * 3. markRead(documentId) läuft beim Öffnen einer Konversation im
 *    Hintergrund (nicht blockierend für die Anzeige) -- die Ungelesen-Zahl
 *    der Liste wird ohnehin beim Zurückgehen ("‹ Volver") frisch von
 *    listChatThreads() geladen, ein zusätzliches Neuladen direkt nach
 *    markRead() wäre doppelte Arbeit für dasselbe Ergebnis.
 *
 * 4. Avatar-Farbe: eine feste, vier Farben große Palette (Miel/Pistacho/
 *    Lavanda/Barro, jeweils die helle 100er-Waschung als Fläche + die 700er/
 *    800er-Stufe als Initialen-Farbe -- dieselben Familien wie die
 *    Erwähnungs-Chips in mentions.ts, aber eigene Zuordnung, weil hier
 *    Personen und nicht Erwähnungstypen unterschieden werden). Ausgewählt
 *    über einen einfachen, deterministischen String-Hash der author_id, DAMIT
 *    dieselbe Person überall in der Liste dieselbe Farbe zeigt, ohne dass
 *    dafür ein Datenbankfeld nötig wäre.
 *
 * 5. Vorschautext in der Gesprächsliste: Erwähnungs-Platzhalter
 *    (@[Label](typ:uuid)) werden zu reinem "@Label" vereinfacht, statt sie
 *    mit renderCommentBody() als Chips zu rendern -- eine einzeilig
 *    gekürzte Vorschau hat keinen Platz für anklickbare Chips, und die volle
 *    Chip-Darstellung gibt es ohnehin gleich beim Öffnen der Konversation.
 *
 * 6. Versions-Chip-Klick im Nachrichtentext: löst seit der Erweiterung aus
 *    Abschnitt 3.2 der Übergabe dieselbe Web/Handy-Vorschau aus wie der
 *    Datei-Streifen und "Ver" auf der Vorschlagskarte (siehe
 *    openVersionOrTab()/supportsInlinePreview() weiter unten) -- die dafür
 *    nötige VersionRow kommt aus `activeVersions`, das bei jedem
 *    openThread() zusammen mit Dokument und Kommentaren geladen wird (kein
 *    zusätzlicher Netzwerkaufruf je Klick). Nur wenn die referenzierte
 *    Version darin nicht (mehr) auftaucht, bleibt der alte Rückfall
 *    bestehen: einfach zum Dokument.
 *
 * 7. Enter-zum-Senden vs. das @-Menü: attachMentionInput() hängt seinen
 *    eigenen keydown-Listener zuerst ans Textfeld (wird vor dem Senden-
 *    Listener hier registriert). Wählt es bei offenem Menü mit Enter einen
 *    Kandidaten aus, ruft es event.preventDefault() auf. Der Senden-Handler
 *    hier prüft genau das (event.defaultPrevented) statt z. B. menu.hidden
 *    zu prüfen -- Letzteres wäre ein Wettlauf, weil das Menü synchron
 *    innerhalb desselben Tastendrucks schon wieder geschlossen sein kann,
 *    bevor dieser zweite Listener überhaupt läuft.
 *
 * 8. Fehlerbehandlung wie document-detail.ts (dort Entscheidung 1):
 *    documents-store.ts/-comments.ts/chat-store.ts liefern bereits
 *    übersetzte spanische Fehler über Error-Objekte -- errorMessage() nimmt
 *    deren `message` direkt, humanError() ist nur die Rückfallebene für den
 *    unwahrscheinlichen Fall eines nicht übersetzten Fehlers.
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN DER ÜBERGABE (HANDOFF-CHAT-DEPLOY.md Abschnitt 3):
 *
 * 9. Web/Handy-Unterscheidung (3.2): supportsInlinePreview() unten prüft
 *    ZWEI Dinge -- `display-mode: standalone` (greift von selbst, sobald die
 *    eigenständige App aus Phase 7c existiert, ohne dass diese Datei etwas
 *    über Phasen wissen muss) ODER eine Mindestbreite des Browserfensters
 *    (60rem). Der Auftrag verlangt ausdrücklich "generell bei ausreichender
 *    Bildschirmbreite innerhalb der App", nicht nur "Handy ja, Rechner nein"
 *    -- eine reine Breitenschwelle ist dafür der einfachste Weg, der ohne
 *    Kenntnis der (noch nicht gebauten) Phase 7c auskommt.
 *
 * 10. Nach Aceptar/Rechazar auf der Vorschlagskarte (3.1) wird die GESAMTE
 *     Konversation über openThread() neu geladen, statt Versionen/
 *     Kommentare/Aufgaben einzeln gezielt zu patchen -- einfacher, robuster
 *     gegen Zustände, die sich mehrfach ändern (die Vorschlagskarte
 *     verschwindet, die neue Version wird "actual"), und deckt sich wörtlich
 *     mit dem Auftrag ("Gesprächsansicht neu laden").
 *
 * 11. Der "Tareas"-Kopfbereich (3.3) lädt SOFORT nach dem Öffnen einer
 *     Konversation, nicht erst beim ersten Aufklappen (anders als
 *     "Tareas de esta carpeta" in documents-view.ts, das laut
 *     documents-tasks.ts, Entscheidung 1, bewusst pro Ordner on-demand
 *     lädt). Eine Konversation hat immer genau EIN Dokument -- der
 *     zusätzliche Aufruf ist unkritisch, genau wie die Aufgaben in
 *     document-detail.ts, die ebenfalls sofort (nur nicht blockierend)
 *     laden. NICHT blockierend für die restliche Ansicht (reloadTasksBox()),
 *     aus demselben Grund wie dort (Entscheidung 10 in document-detail.ts).
 *
 * 12. chatTaskFormDialog() (ganz unten) ist bewusst eine eigene Kopie von
 *     taskFormDialog() aus document-detail.ts (dort nicht exportiert) --
 *     dieselbe Vorgehensweise, mit der document-detail.ts schon
 *     textPromptDialog() aus documents-view.ts übernimmt (dort Entscheidung
 *     3): Optik und Verhalten sollen zusammenpassen, ohne eine gemeinsame
 *     Datei nur für ein Formular mit drei Feldern anzulegen.
 *
 * 13. Datei-Streifen (.chat-filestrip) und Vorschlagskarten-"Ver" nutzen
 *     dieselbe openVersionOrTab()-Funktion wie der Versions-Chip -- eine
 *     einzige Stelle für die Web/Handy-Entscheidung, statt sie drei Mal zu
 *     wiederholen.
 * ============================================================================
 */

/**
 * Siehe Entscheidung im Dateikopf zu `opts.onOpenDocument`.
 *
 * `onScreenChange` ist NUR für die eigenständige Chat-App gedacht (/chat):
 * dort zeigt eine eigene, feste Kopfzeile "Chat" + "Cerrar sesión" -- doppelt
 * zur Gesprächsliste ("Chat"-Überschrift) bzw. überflüssig, sobald ohnehin
 * schon ein Gespräch mit eigenem Zurück-Knopf offen ist. Der Gastgeber
 * (chat-standalone.ts) blendet seine Kopfzeile darüber nur bei `'list'` ein.
 * Innerhalb von /admin bleibt das Argument einfach weg, nichts ändert sich.
 *
 * `onClose` ist NUR für das eingebettete /admin-Panel gedacht: dort gab es
 * bisher keine eigene Schließen-Fläche, nur der Umweg über den
 * "Documentos"-Knopf in der äußeren Kopfzeile (siehe documents-view.ts).
 * Gesetzt, erscheint ein feststehendes ×-Symbol oben rechts über allen drei
 * internen Bildschirmen (Liste/Konversation/Vorschau). In der eigenständigen
 * App (/chat) bleibt das Argument weg -- da gibt es nichts, wohin man
 * "schließen" könnte, das Fenster selbst zu verlassen ist Sache des Systems.
 */
export interface MountChatOptions {
  onOpenDocument?: (documentId: string) => void;
  onScreenChange?: (screen: 'list' | 'conversation' | 'preview') => void;
  onClose?: () => void;
}

let teardown: (() => void) | null = null;

// Feste Farbpalette für Avatar-Initialen -- siehe Entscheidung 4 im Dateikopf.
const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: 'var(--miel-100)', fg: 'var(--miel-800)' },
  { bg: 'var(--pistacho-100)', fg: 'var(--pistacho-700)' },
  { bg: 'var(--lavanda-100)', fg: 'var(--lavanda-700)' },
  { bg: 'var(--barro-100)', fg: 'var(--barro-700)' },
];

export async function mountChat(container: HTMLElement, opts?: MountChatOptions): Promise<void> {
  const root = el('div', 'chat-view');
  container.append(root);

  /**
   * Siehe Entscheidung im Dateikopf zu `opts.onClose`. Bewusst KEIN einzelner,
   * schwebender Knopf über allen drei Bildschirmen (erste Fassung) -- der
   * Gesprächskopf hat mit "‹ Volver" links und "Ver documento →" rechts schon
   * beide Ecken belegt, ein absolut positioniertes × oben rechts läge exakt
   * auf "Ver documento →". Stattdessen hängt jeder der drei Bildschirme
   * (Liste/Konversation/Vorschau) den Knopf selbst als normales, flex:none
   * Element ans Ende seiner eigenen Kopfzeile -- reiht sich dadurch natürlich
   * neben das dort schon Vorhandene ein, keine Überlappung möglich.
   */
  function buildCloseBtn(): HTMLButtonElement | null {
    if (!opts?.onClose) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-close';
    btn.setAttribute('aria-label', 'Cerrar chat');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M6 6l12 12M18 6L6 18"/></svg>';
    btn.addEventListener('click', () => opts.onClose?.());
    return btn;
  }

  /**
   * Einziger Ausgang aus dem Chat zu einem Dokument -- alle drei Stellen
   * weiter unten (Kopfzeilen-Knopf, Dokument-Erwähnungs-Chip, Rückfall bei
   * unauffindbarer Version) rufen NUR NOCH diese Funktion, nie mehr direkt
   * navigate(). Siehe Entscheidung im Dateikopf.
   */
  function goToDocument(id: string): void {
    if (opts?.onOpenDocument) opts.onOpenDocument(id);
    else navigate({ view: 'documento', id });
  }

  // Lade-Zustand, bevor überhaupt etwas zu zeigen ist -- wie document-detail.ts.
  const loadingEl = el('p', 'chat-loading', 'Cargando…');
  root.append(loadingEl);

  let profiles: ProfileRow[] = [];
  let ownUserId: string | null = null;
  let threads: ChatThread[] = [];

  // Zustand der GERADE OFFENEN Konversation (3.1/3.2/3.3) -- bei jedem
  // openThread() frisch geladen bzw. gesetzt, siehe dort. `currentConvRoot`
  // ist der bereits gebaute Gesprächsschirm, damit "‹ Volver" aus der
  // Versionsvorschau (3.2) dorthin zurückkehren kann, ohne alles neu zu
  // laden oder den Bildlauf der Nachrichten zurückzusetzen.
  let activeDoc: DocumentWithCurrentVersion | null = null;
  let activeVersions: VersionRow[] = [];
  let activeTasks: TaskRow[] = [];
  let currentConvRoot: HTMLElement | null = null;
  // Referenzen auf den "Tareas"-Kopfbereich der offenen Konversation, siehe
  // Entscheidung 11 im Dateikopf. `documentId` schützt reloadTasksBox() davor,
  // eine inzwischen verlassene Konversation nachträglich noch zu befüllen.
  let tasksBoxRefs: {
    summaryLabel: HTMLElement;
    body: HTMLElement;
    documentId: string;
  } | null = null;

  try {
    const [profileList, ownProfile, threadList] = await Promise.all([
      listProfiles(),
      currentProfile(),
      listChatThreads(),
    ]);
    profiles = profileList;
    ownUserId = ownProfile?.id ?? null;
    threads = threadList;
  } catch (err) {
    loadingEl.textContent = errorMessage(err);
    teardown = () => root.remove();
    return;
  }

  loadingEl.remove();

  // Fest bleibender Rahmen -- showList()/openThread() tauschen nur den
  // Inhalt von `body` aus, damit Kopf/Fußbereich der Konversation nicht bei
  // jeder Kleinigkeit neu aufgebaut werden müssen.
  const body = el('div', 'chat-body');
  root.append(body);

  /* ------------------------------------------------------------------- *
   * Hilfsmittel
   * ------------------------------------------------------------------- */

  function nameOf(userId: string): string {
    return profiles.find((p) => p.id === userId)?.display_name ?? 'Alguien';
  }

  function initialsOf(userId: string): string {
    return profiles.find((p) => p.id === userId)?.initials ?? '?';
  }

  /** Wie guardSoft() in document-detail.ts -- Fehler landen im Toast, kein Neuladen danach. */
  async function guardSoft(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function reloadThreads(): Promise<void> {
    try {
      threads = await listChatThreads();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  /* ------------------------------------------------------------------- *
   * Gesprächsliste
   * ------------------------------------------------------------------- */

  function showList(): void {
    body.replaceChildren();
    body.append(buildThreadList());
    opts?.onScreenChange?.('list');
  }

  function buildThreadList(): HTMLElement {
    const wrap = el('div', 'chat-list');
    const headRow = el('div', 'chat-list__headrow');
    headRow.append(el('h1', 'chat-list__title', 'Chat'));
    const closeBtn = buildCloseBtn();
    if (closeBtn) headRow.append(closeBtn);
    wrap.append(headRow);

    if (threads.length === 0) {
      wrap.append(
        el('p', 'chat-empty', 'Todavía no hay conversaciones. Abrí un documento para empezar una.'),
      );
      return wrap;
    }

    const ul = el('ul', 'chat-threads');
    for (const t of threads) ul.append(buildThreadRow(t));
    wrap.append(ul);
    return wrap;
  }

  function buildThreadRow(t: ChatThread): HTMLElement {
    const li = el('li', 'chat-thread');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-thread__btn';
    btn.append(buildAvatar(t.lastMessage.author_id));

    const info = el('div', 'chat-thread__info');
    info.append(el('span', 'chat-thread__folder', t.folderName));
    info.append(el('span', 'chat-thread__title', t.documentTitle));
    info.append(el('p', 'chat-thread__preview', previewText(t.lastMessage.body)));
    btn.append(info);

    const meta = el('div', 'chat-thread__meta');
    meta.append(el('span', 'chat-thread__time', formatRelative(t.lastMessage.created_at)));
    if (t.unreadCount > 0) {
      const badge = el('span', 'chat-thread__badge', String(t.unreadCount));
      badge.setAttribute('aria-label', `${t.unreadCount} mensajes sin leer`);
      meta.append(badge);
    }
    btn.append(meta);

    btn.addEventListener('click', () => void openThread(t.documentId));
    li.append(btn);
    return li;
  }

  function buildAvatar(userId: string): HTMLElement {
    const span = el('span', 'chat-avatar', initialsOf(userId));
    const palette = AVATAR_PALETTE[hashString(userId) % AVATAR_PALETTE.length];
    span.style.background = palette.bg;
    span.style.color = palette.fg;
    // Rein dekorativ -- der Name steht daneben als Text (Ordner/Titel) bzw.
    // in der Konversation selbst über der fremden Nachricht.
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  /* ------------------------------------------------------------------- *
   * Konversationsansicht
   * ------------------------------------------------------------------- */

  async function openThread(documentId: string): Promise<void> {
    body.replaceChildren();
    const loading = el('p', 'chat-loading', 'Cargando conversación…');
    body.append(loading);

    let doc: DocumentWithCurrentVersion | null = null;
    let comments: CommentRow[] = [];
    try {
      // Versionen JETZT laden (nicht erst beim Klick auf einen Chip) --
      // sie werden sofort für die Vorschlagskarte (3.1) und den Datei-
      // Streifen (3.2) gebraucht, siehe buildConversation() unten.
      [doc, comments, activeVersions] = await Promise.all([
        getDocument(documentId),
        listComments(documentId),
        listVersions(documentId),
      ]);
    } catch (err) {
      loading.textContent = errorMessage(err);
      return;
    }

    if (!doc) {
      toast('Ese documento ya no existe.', { tone: 'error' });
      await reloadThreads();
      showList();
      return;
    }

    activeDoc = doc;
    body.replaceChildren();
    const { root: convEl, messagesEl } = buildConversation(doc, comments);
    currentConvRoot = convEl;
    body.append(convEl);
    scrollToBottom(messagesEl);
    opts?.onScreenChange?.('conversation');

    // Gelesen markieren, sobald der Verlauf offen ist (Plan Abschnitt 8,
    // Punkt 4: Öffnen reicht, kein Bildlauf-Tracking) -- läuft im
    // Hintergrund, siehe Entscheidung 3 im Dateikopf.
    void guardSoft(() => markRead(documentId));

    // Aufgaben nicht blockierend nachladen, siehe Entscheidung 11 im Dateikopf.
    void reloadTasksBox(documentId);
  }

  function buildConversation(
    doc: DocumentWithCurrentVersion,
    initialComments: CommentRow[],
  ): { root: HTMLElement; messagesEl: HTMLElement } {
    const wrap = el('div', 'chat-conversation');

    const head = el('header', 'chat-conv__head');
    const backBtn = el('button', 'chat-conv__back', '‹ Volver');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => {
      void (async () => {
        // Frisch laden, damit die Ungelesen-Zahl in der Liste stimmt --
        // siehe Entscheidung 3 im Dateikopf.
        await reloadThreads();
        showList();
      })();
    });
    head.append(backBtn);

    const headInfo = el('div', 'chat-conv__headinfo');
    headInfo.append(el('p', 'chat-conv__title', doc.title));
    headInfo.append(el('p', 'chat-conv__version', versionLabel(doc)));
    head.append(headInfo);

    const openDocBtn = el('button', 'btn btn--ghost btn--sm chat-conv__opendoc', 'Ver documento →');
    openDocBtn.type = 'button';
    openDocBtn.addEventListener('click', () => goToDocument(doc.id));
    head.append(openDocBtn);

    const closeBtn = buildCloseBtn();
    if (closeBtn) head.append(closeBtn);
    wrap.append(head);

    // Datei-Streifen mit der aktuellen Version, direkt unter dem Kopf --
    // Auftrag 3.2 ("filestrip"). Ohne currentVersion (Dokument noch ohne
    // Fassung) gibt es nichts zu zeigen.
    const filestrip = buildFilestrip(doc);
    if (filestrip) wrap.append(filestrip);

    // Einklappbarer "Tareas"-Bereich, Auftrag 3.3 -- Inhalt kommt erst mit
    // reloadTasksBox() (nicht blockierend, siehe openThread()).
    wrap.append(buildTasksBox(doc.id));

    // Angeheftete Vorschlagskarte(n), Auftrag 3.1 -- fest sichtbar, NICHT
    // Teil der scrollenden Nachrichtenliste weiter unten.
    const proposals = activeVersions.filter((v) => v.state === 'proposal');
    if (proposals.length > 0) {
      const proposalsWrap = el('div', 'chat-proposals');
      for (const p of proposals) proposalsWrap.append(buildProposalCard(p, doc));
      wrap.append(proposalsWrap);
    }

    const messagesEl = el('div', 'chat-messages');
    messagesEl.setAttribute('role', 'log');
    messagesEl.setAttribute('aria-label', 'Mensajes de la conversación');
    renderMessages(messagesEl, initialComments, doc.id);
    wrap.append(messagesEl);

    wrap.append(buildComposer(doc.id, messagesEl));

    return { root: wrap, messagesEl };
  }

  function renderMessages(container: HTMLElement, comments: CommentRow[], documentId: string): void {
    container.replaceChildren();
    if (comments.length === 0) {
      // In der Praxis nicht erreichbar (ein Thread existiert laut
      // chat-store.ts nur MIT mindestens einer Nachricht) -- trotzdem als
      // Sicherheitsnetz, falls sich das je ändert.
      container.append(el('p', 'chat-empty', 'Todavía no hay mensajes en esta conversación.'));
      return;
    }

    let lastDay: string | null = null;
    for (const c of comments) {
      const day = dayLabel(c.created_at);
      if (day !== lastDay) {
        container.append(el('div', 'chat-daysep', day));
        lastDay = day;
      }
      container.append(buildBubble(c, documentId));
    }
  }

  function buildBubble(c: CommentRow, documentId: string): HTMLElement {
    const isOwn = ownUserId !== null && c.author_id === ownUserId;
    const row = el('div', `chat-bubblerow${isOwn ? ' chat-bubblerow--own' : ' chat-bubblerow--other'}`);
    const group = el('div', `chat-bubblegroup${isOwn ? ' chat-bubblegroup--own' : ' chat-bubblegroup--other'}`);

    const bubble = el('div', `chat-bubble${isOwn ? ' chat-bubble--own' : ' chat-bubble--other'}`);
    if (!isOwn) {
      bubble.append(el('span', 'chat-bubble__author', nameOf(c.author_id)));
    }

    const bodyEl = el('div', 'chat-bubble__body');
    bodyEl.append(
      renderCommentBody(c.body, {
        // Personen-Chip: rein hervorgehoben, kein Klick-Handler -- ohne
        // onPersonClick baut renderCommentBody() dafür ein <span>, siehe
        // mentions.ts, Entscheidung 7.
        onDocumentClick: (id) => {
          if (id !== documentId) goToDocument(id);
        },
        // Öffnet die Vorschau GENAU dieser Version (Auftrag 3.2), siehe
        // Entscheidung 6/9 im Dateikopf. Ohne Treffer in `activeVersions`
        // (z. B. eine sehr alte, inzwischen unauffindbare Version) bleibt der
        // alte Rückfall bestehen: einfach zum Dokument.
        onVersionClick: (id) => {
          const version = activeVersions.find((v) => v.id === id);
          if (!version || !activeDoc) {
            goToDocument(documentId);
            return;
          }
          void openVersionOrTab(version, activeDoc);
        },
      }),
    );
    bubble.append(bodyEl);
    bubble.append(el('span', 'chat-bubble__time', formatTime(c.created_at)));
    group.append(bubble);

    // "+ Tarea" unter JEDER Nachricht (Auftrag 3.3), unabhängig davon, wer
    // sie geschrieben hat -- wie "Convertir en tarea" in document-detail.ts.
    const taskBtn = el('button', 'chat-bubble__taskbtn', '+ Tarea');
    taskBtn.type = 'button';
    taskBtn.addEventListener('click', () => openAddTaskFromComment(c, documentId));
    group.append(taskBtn);

    row.append(group);
    return row;
  }

  /* ------------------------------------------------------------------- *
   * Datei-Streifen (Auftrag 3.2, Mockup ".filestrip")
   * ------------------------------------------------------------------- */

  function buildFilestrip(doc: DocumentWithCurrentVersion): HTMLElement | null {
    const version = doc.currentVersion;
    if (!version) return null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-filestrip';
    btn.addEventListener('click', () => void openVersionOrTab(version, doc));

    const thumb = el('span', 'chat-filestrip__thumb');
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = FILE_ICON;
    btn.append(thumb);

    btn.append(
      el(
        'span',
        'chat-filestrip__label',
        version.version_no != null ? `Ver v${version.version_no} en tamaño completo` : 'Ver en tamaño completo',
      ),
    );

    // Vorschaubild NACHTRÄGLICH laden -- kein Netzwerkaufruf, solange
    // niemand diese Konversation öffnet. Bleibt beim Symbol, wenn es
    // fehlschlägt oder kein Bild ist (siehe getThumbnailUrl() in
    // documents-preview.ts).
    if (previewKindFor(version) === 'image') {
      void getThumbnailUrl(version)
        .then((url) => {
          if (!url) return;
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          thumb.replaceChildren(img);
        })
        .catch(() => {
          // Kaputte Vorschau-Adresse -- bleibt beim Symbol, siehe oben.
        });
    }

    return btn;
  }

  /* ------------------------------------------------------------------- *
   * Version ansehen -- Web/Handy-Unterscheidung (Auftrag 3.2)
   * ------------------------------------------------------------------- */

  /**
   * Bei ausreichender Breite bzw. einer eigenständigen App (Phase 7c, siehe
   * Entscheidung 9 im Dateikopf): dritter interner Bildschirm HIER in
   * chat-view.ts. Im schmalen eingebetteten Admin-Panel (aktuelle Situation):
   * signierte Original-Adresse in einem neuen Tab, wie der bestehende
   * "Descargar"-Knopf in document-detail.ts.
   */
  async function openVersionOrTab(version: VersionRow, doc: DocumentWithCurrentVersion): Promise<void> {
    if (supportsInlinePreview()) {
      showVersionPreview(version, doc);
      return;
    }
    await guardSoft(async () => {
      const url = await getOriginalUrl(version);
      window.open(url, '_blank', 'noopener');
    });
  }

  function showConversation(): void {
    if (!currentConvRoot) return;
    body.replaceChildren();
    body.append(currentConvRoot);
    opts?.onScreenChange?.('conversation');
  }

  function showVersionPreview(version: VersionRow, doc: DocumentWithCurrentVersion): void {
    body.replaceChildren();
    body.append(buildVersionPreviewScreen(version, doc));
    opts?.onScreenChange?.('preview');
  }

  function buildVersionPreviewScreen(version: VersionRow, doc: DocumentWithCurrentVersion): HTMLElement {
    const wrap = el('div', 'chat-conversation');

    const head = el('header', 'chat-conv__head');
    const backBtn = el('button', 'chat-conv__back', '‹ Volver');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => showConversation());
    head.append(backBtn);

    const headInfo = el('div', 'chat-conv__headinfo');
    headInfo.append(el('p', 'chat-conv__title', doc.title));
    headInfo.append(
      el('p', 'chat-conv__version', version.version_no != null ? `Versión ${version.version_no}` : 'Propuesta'),
    );
    head.append(headInfo);

    const closeBtn = buildCloseBtn();
    if (closeBtn) head.append(closeBtn);
    wrap.append(head);

    const previewBody = el('div', 'chat-preview__body');
    wrap.append(previewBody);
    void fillVersionPreviewBody(previewBody, version);

    return wrap;
  }

  async function fillVersionPreviewBody(container: HTMLElement, version: VersionRow): Promise<void> {
    const kind = previewKindFor(version);
    const big = formatMegabytes(version.byte_size);

    if (kind === 'pdf') {
      async function mountFrame(): Promise<void> {
        await guardSoft(async () => {
          const url = await getOriginalUrl(version);
          const iframe = document.createElement('iframe');
          iframe.className = 'chat-preview__iframe';
          iframe.src = url;
          iframe.title = version.file_name;
          container.replaceChildren(iframe, buildOpenTabLink(version));
        });
      }

      if (shouldAutoload(version)) {
        await mountFrame();
      } else {
        container.replaceChildren(buildGateButton(big, () => void mountFrame()), buildOpenTabLink(version));
      }
      return;
    }

    if (kind === 'image') {
      async function showOriginal(): Promise<void> {
        await guardSoft(async () => {
          const url = await getOriginalUrl(version);
          const img = document.createElement('img');
          img.className = 'chat-preview__image';
          img.src = url;
          img.alt = version.file_name;
          container.replaceChildren(img);
        });
      }

      if (shouldAutoload(version)) {
        await showOriginal();
      } else {
        container.replaceChildren(buildGateButton(big, () => void showOriginal()));
      }
      return;
    }

    // 'other' -- Word, Excel usw.: nur Symbol, Dateiname, Download.
    const other = el('div', 'chat-preview__other');
    const icon = el('span', 'chat-preview__othericon');
    icon.innerHTML = FILE_ICON;
    other.append(icon);
    other.append(el('p', 'chat-preview__otherfile', version.file_name));
    const dlBtn = el('button', 'btn btn--sm', 'Descargar');
    dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => {
      void guardSoft(async () => {
        const url = await getOriginalUrl(version);
        window.open(url, '_blank', 'noopener');
      });
    });
    other.append(dlBtn);
    container.replaceChildren(other);
  }

  function buildOpenTabLink(version: VersionRow): HTMLElement {
    const link = el('a', 'chat-preview__opentab', 'Abrir en pestaña nueva ↗');
    link.href = '#';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void guardSoft(async () => {
        const url = await getOriginalUrl(version);
        window.open(url, '_blank', 'noopener');
      });
    });
    return link;
  }

  /** Ladebremse ab PREVIEW_AUTOLOAD_LIMIT, wie in document-detail.ts. */
  function buildGateButton(sizeLabel: string, onLoad: () => void): HTMLElement {
    const btn = el('button', 'btn chat-preview__gate', `Vista previa (${sizeLabel}) — cargar`);
    btn.type = 'button';
    btn.addEventListener('click', () => onLoad(), { once: true });
    return btn;
  }

  /* ------------------------------------------------------------------- *
   * Vorschlagskarte (Auftrag 3.1, Mockup ".propcard")
   * ------------------------------------------------------------------- */

  function buildProposalCard(p: VersionRow, doc: DocumentWithCurrentVersion): HTMLElement {
    const card = el('article', 'chat-propcard');
    card.append(el('span', 'chat-propcard__badge', 'Propuesta pendiente'));
    card.append(el('p', 'chat-propcard__meta', `${nameOf(p.uploaded_by)} · ${formatRelative(p.uploaded_at)}`));
    if (p.note) card.append(el('p', 'chat-propcard__note', p.note));

    const actions = el('div', 'chat-propcard__actions');
    const verBtn = el('button', 'btn btn--ghost btn--sm', 'Ver');
    verBtn.type = 'button';
    verBtn.addEventListener('click', () => void openVersionOrTab(p, doc));
    actions.append(verBtn);

    const acceptBtn = el('button', 'btn btn--sm', 'Aceptar');
    acceptBtn.type = 'button';
    acceptBtn.addEventListener('click', () => {
      void guardSoft(async () => {
        await acceptProposal(p.id);
        toast('Propuesta aceptada. Ahora es la versión vigente.', { tone: 'ok' });
        // Ganze Konversation neu laden, siehe Entscheidung 10 im Dateikopf.
        await openThread(doc.id);
      });
    });
    actions.append(acceptBtn);

    // adm-btn--danger liefert nur die Farbe; Form/Polsterung kommen von .btn.
    const rejectBtn = el('button', 'btn btn--sm adm-btn--danger', 'Rechazar');
    rejectBtn.type = 'button';
    actions.append(rejectBtn);
    card.append(actions);

    // Pflichtfeld für den Ablehnungsgrund, wie buildProposalCard() in
    // document-detail.ts -- "Confirmar rechazo" bleibt ohne Text gesperrt.
    const rejectForm = el('div', 'chat-propcard__rejectform');
    rejectForm.hidden = true;
    const label = el('label', 'adm-label', 'Motivo del rechazo');
    const rejectId = `chat-reject-${p.id}`;
    label.htmlFor = rejectId;
    const textarea = document.createElement('textarea');
    textarea.id = rejectId;
    textarea.className = 'adm-input chat-propcard__rejectfield';
    textarea.required = true;
    textarea.rows = 2;
    textarea.placeholder = 'Ej: la escala no coincide con el plano anterior.';
    const rejectActions = el('div', 'chat-propcard__rejectactions');
    const confirmRejectBtn = el('button', 'btn btn--sm adm-btn--danger', 'Confirmar rechazo');
    confirmRejectBtn.type = 'button';
    confirmRejectBtn.disabled = true;
    const cancelRejectBtn = el('button', 'btn btn--ghost btn--sm', 'Cancelar');
    cancelRejectBtn.type = 'button';

    textarea.addEventListener('input', () => {
      confirmRejectBtn.disabled = textarea.value.trim().length === 0;
    });
    cancelRejectBtn.addEventListener('click', () => {
      rejectForm.hidden = true;
      textarea.value = '';
      confirmRejectBtn.disabled = true;
    });
    confirmRejectBtn.addEventListener('click', () => {
      const reason = textarea.value.trim();
      if (!reason) return; // Ohne Grund geht es nicht ab.
      void guardSoft(async () => {
        await rejectProposal(p.id, reason);
        toast('Propuesta rechazada.', { tone: 'ok' });
        await openThread(doc.id);
      });
    });
    rejectBtn.addEventListener('click', () => {
      rejectForm.hidden = !rejectForm.hidden;
      if (!rejectForm.hidden) textarea.focus();
    });

    rejectActions.append(cancelRejectBtn, confirmRejectBtn);
    rejectForm.append(label, textarea, rejectActions);
    card.append(rejectForm);

    return card;
  }

  /* ------------------------------------------------------------------- *
   * "Tareas"-Kopfbereich (Auftrag 3.3, Mockup ".tasksbox")
   * ------------------------------------------------------------------- */

  /**
   * Gleiches Aufklapp-Muster wie "Tareas de esta carpeta" in
   * documents-view.ts::mountFolderDocuments() -- <details>/<summary>,
   * tastaturbedienbar ohne eigenes JS-Gerüst. Der Inhalt startet leer
   * ("Cargando…"); reloadTasksBox() (aus openThread(), siehe Entscheidung 11
   * im Dateikopf) befüllt ihn, sobald die Aufgaben da sind.
   */
  function buildTasksBox(documentId: string): HTMLElement {
    const details = document.createElement('details');
    details.className = 'chat-tasksbox';
    const summary = document.createElement('summary');
    summary.className = 'chat-tasksbox__summary';
    const summaryLabel = el('span', undefined, 'Tareas');
    summary.append(summaryLabel);
    const boxBody = el('div', 'chat-tasksbox__body');
    boxBody.append(el('p', 'chat-empty', 'Cargando…'));
    details.append(summary, boxBody);

    tasksBoxRefs = { summaryLabel, body: boxBody, documentId };
    return details;
  }

  function renderTasksBox(): void {
    if (!tasksBoxRefs) return;
    const { summaryLabel, body: boxBody, documentId } = tasksBoxRefs;
    const open = activeTasks.filter((t) => t.status === 'open');
    summaryLabel.textContent = open.length > 0 ? `Tareas (${open.length})` : 'Tareas';

    const list = el('ul', 'chat-tasks');
    if (open.length === 0) {
      list.append(el('li', 'chat-empty', 'No hay tareas pendientes.'));
    } else {
      for (const t of open) list.append(buildTaskRow(t, documentId));
    }

    const addBtn = el('button', 'btn btn--ghost btn--sm', '+ Nueva tarea');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => openNewTaskDialog(documentId));

    boxBody.replaceChildren(list, addBtn);
  }

  function buildTaskRow(t: TaskRow, documentId: string): HTMLElement {
    const li = el('li', 'chat-taskrow');
    const isOverdue = t.due_date !== null && t.due_date < todayIso();
    if (isOverdue) li.classList.add('chat-taskrow--overdue');

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'chat-taskrow__check';
    doneBtn.setAttribute('aria-label', 'Marcar hecha');
    doneBtn.title = 'Marcar hecha';
    doneBtn.addEventListener('click', () => {
      void guardSoft(async () => {
        await markTaskDone(t.id);
        toast('Tarea completada.', {
          tone: 'ok',
          undo: () =>
            guardSoft(async () => {
              await reopenTask(t.id);
              await reloadTasksBox(documentId);
            }),
        });
        await reloadTasksBox(documentId);
      });
    });
    li.append(doneBtn);

    const info = el('div', 'chat-taskrow__info');
    info.append(el('p', 'chat-taskrow__title', t.title));
    const metaBits: string[] = [t.assignee_id ? `Para ${nameOf(t.assignee_id)}` : 'Sin asignar'];
    if (t.due_date) {
      metaBits.push(isOverdue ? `Vencida · ${formatDueDate(t.due_date)}` : formatDueDate(t.due_date));
    }
    info.append(el('p', 'chat-taskrow__meta', metaBits.join(' · ')));
    li.append(info);

    return li;
  }

  /** Wirft NIE -- ein fehlgeschlagener Ladeversuch zeigt sich nur als Toast/leere Liste. */
  async function reloadTasksBox(documentId: string): Promise<void> {
    try {
      activeTasks = await listTasksForDocument(documentId);
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      activeTasks = [];
    }
    // Nur anwenden, wenn zwischenzeitlich keine andere Konversation geöffnet
    // wurde (tasksBoxRefs gehört noch zu documentId) -- sonst würde eine
    // spät ankommende Antwort den "Tareas"-Bereich einer bereits verlassenen
    // Konversation überschreiben.
    if (tasksBoxRefs?.documentId === documentId) renderTasksBox();
  }

  function openNewTaskDialog(documentId: string): void {
    void (async () => {
      const result = await chatTaskFormDialog(profiles, { dialogTitle: 'Nueva tarea', confirmLabel: 'Crear tarea' });
      if (!result) return;
      await guardSoft(async () => {
        await createTask({
          documentId,
          title: result.title,
          assigneeId: result.assigneeId,
          dueDate: result.dueDate,
        });
        toast('Tarea creada.', { tone: 'ok' });
        await reloadTasksBox(documentId);
      });
    })();
  }

  function openAddTaskFromComment(c: CommentRow, documentId: string): void {
    void (async () => {
      const result = await chatTaskFormDialog(profiles, {
        dialogTitle: '+ Tarea',
        confirmLabel: 'Crear tarea',
        prefillTitle: titleFromComment(c.body),
      });
      if (!result) return;
      await guardSoft(async () => {
        await createTaskFromComment(c, result.title, result.assigneeId, result.dueDate);
        toast('Tarea creada a partir del mensaje.', { tone: 'ok' });
        await reloadTasksBox(documentId);
      });
    })();
  }

  /* ------------------------------------------------------------------- *
   * Neue Fassung direkt aus dem Chat hochladen ("+" im Eingabebereich)
   * ------------------------------------------------------------------- */

  function openUploadFromComposer(documentId: string): void {
    void (async () => {
      // Voreinstellung immer 'original' -- anders als document-detail.ts
      // (dort Entscheidung 8) gibt es hier keine geladene Ordnerliste, aus
      // der sich das upload_mode des Ordners nachschlagen ließe, und der
      // Chat lädt sie extra dafür auch nicht nach. 'original' ist ohnehin
      // der sichere Standard (dieselbe Rückfallebene wie dort, wenn der
      // Ordner nicht mehr auffindbar ist) und im Dialog selbst umschaltbar.
      const result = await chatUploadDialog('original');
      if (!result) return;

      if (result.file.size > MAX_UPLOAD_BYTES) {
        toast(
          `Este archivo pesa ${formatMegabytes(result.file.size)} y supera el límite de 50 MB del plan ` +
            'gratuito de Supabase. Elegí un archivo más chico, o pedile a Maxi que revise el plan de almacenamiento.',
          { tone: 'error' },
        );
        return;
      }

      await guardSoft(async () => {
        if (result.path === 'directo') {
          const outcome = await publishNewVersion({
            documentId,
            file: result.file,
            mode: result.mode,
            note: result.note,
          });
          toast(
            outcome.wasDeduplicated
              ? 'Nueva versión establecida. Ya teníamos ese archivo -- no ocupa espacio de nuevo.'
              : 'Nueva versión establecida.',
            { tone: 'ok' },
          );
        } else {
          const outcome = await submitVersionProposal({
            documentId,
            file: result.file,
            mode: result.mode,
            note: result.note,
          });
          toast(
            outcome.wasDeduplicated
              ? 'Propuesta enviada (ya teníamos ese archivo, no ocupa espacio de nuevo). Queda a la espera de aprobación.'
              : 'Propuesta enviada. Queda a la espera de aprobación.',
            { tone: 'ok' },
          );
        }
        // Ganze Konversation neu laden -- wie nach Aceptar/Rechazar auf der
        // Vorschlagskarte (Entscheidung 10 im Dateikopf): zeigt sofort den
        // aktualisierten Datei-Streifen bzw. die neue Vorschlagskarte.
        await openThread(documentId);
      });
    })();
  }

  function buildComposer(documentId: string, messagesEl: HTMLElement): HTMLElement {
    const idPrefix = 'chat-composer';
    const form = document.createElement('form');
    form.className = 'chat-composer';
    form.noValidate = true;

    // "+ Subir" -- direkt aus dem Chat eine neue Fassung hochladen/vorschlagen,
    // ohne erst zum vollen Dokument wechseln zu müssen (siehe Auftrag: gerade
    // am Handy soll das der schnelle Weg sein). Derselbe Dialog/Ablauf wie
    // "+ Subir nueva versión" in document-detail.ts, siehe chatUploadDialog().
    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'chat-composer__attach';
    attachBtn.setAttribute('aria-label', 'Subir nueva versión');
    attachBtn.title = 'Subir nueva versión';
    attachBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14"/></svg>';
    attachBtn.addEventListener('click', () => openUploadFromComposer(documentId));
    form.append(attachBtn);

    const wrap = el('div', 'chat-composer__wrap');
    const label = el('label', 'visually-hidden', 'Mensaje');
    label.htmlFor = `${idPrefix}-field`;
    const textarea = document.createElement('textarea');
    textarea.id = `${idPrefix}-field`;
    textarea.className = 'adm-input chat-composer__field';
    textarea.rows = 1;
    textarea.placeholder = 'Escribí un mensaje… Usá @ para mencionar a alguien o un documento.';
    const menu = el('div', 'chat-mentionmenu');
    menu.id = `${idPrefix}-menu`;
    menu.hidden = true;
    wrap.append(label, textarea, menu);
    form.append(wrap);

    // Registrierung VOR dem eigenen keydown-Listener unten -- siehe
    // Entscheidung 7 im Dateikopf (event.defaultPrevented-Prüfung).
    attachMentionInput(textarea, menu, idPrefix);

    const sendBtn = el('button', 'btn chat-composer__send', 'Enviar');
    sendBtn.type = 'submit';
    form.append(sendBtn);

    async function send(): Promise<void> {
      const value = textarea.value.trim();
      if (!value) return;
      sendBtn.disabled = true;
      await guardSoft(async () => {
        await createComment(documentId, value);
        textarea.value = '';
        const fresh = await listComments(documentId);
        renderMessages(messagesEl, fresh, documentId);
        scrollToBottom(messagesEl);
      });
      sendBtn.disabled = false;
      textarea.focus();
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void send();
    });

    // Enter sendet, Shift+Enter macht eine neue Zeile -- außer das @-Menü hat
    // diesen Enter schon für sich beansprucht (siehe Entscheidung 7).
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) return;
      event.preventDefault();
      void send();
    });

    return form;
  }

  showList();
  teardown = () => root.remove();
}

export function unmountChat(): void {
  teardown?.();
  teardown = null;
}

/* ===========================================================================
   Kleine Hilfsmittel -- Stil an document-detail.ts angelehnt
   =========================================================================== */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Siehe Entscheidung 8 im Dateikopf. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return humanError(err).message;
}

function versionLabel(doc: DocumentWithCurrentVersion): string {
  const v = doc.currentVersion;
  if (!v) return 'Sin versión publicada';
  return v.version_no != null ? `v${v.version_no} · actual` : 'actual';
}

/** Einfacher, deterministischer String-Hash für die Avatar-Farbrotation (Entscheidung 4). */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Erwähnungs-Platzhalter zu reinem "@Label" vereinfacht -- für die
 * einzeilige Vorschau in der Gesprächsliste, siehe Entscheidung 5 im
 * Dateikopf. Frische RegExp pro Aufruf, im selben Vorsichtsstil wie
 * mentions.ts (kein geteilter 'g'-Zustand zwischen Aufrufen).
 */
function previewText(body: string): string {
  const re =
    /@\[([^\]]+)\]\((?:person|document|version):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)/g;
  return body.replace(re, '@$1').replace(/\s+/g, ' ').trim();
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "hace 5 min" / "hace 3 h" / "ayer" / "hace 4 días" / Datum ab einer Woche. */
function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;

  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (dayDiff <= 0) return `hace ${Math.floor(diffMin / 60)} h`;
  if (dayDiff === 1) return 'ayer';
  if (dayDiff < 7) return `hace ${dayDiff} días`;
  return then.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Datumstrenner in der Konversation: "Hoy" / "Ayer" / volles Datum. */
function dayLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (dayDiff === 0) return 'Hoy';
  if (dayDiff === 1) return 'Ayer';
  return then.toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
}

/** Ans Ende der Nachrichtenliste springen -- nach dem Öffnen und nach jedem Senden. */
function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Titel-Vorbelegung für "+ Tarea": die ersten Worte der Nachricht, wie
 * titleFromComment() in document-detail.ts -- hier auf Basis von
 * previewText() (streift Erwähnungs-Platzhalter bereits auf "@Label" zurecht,
 * siehe Entscheidung 5 im Dateikopf), statt denselben Regex ein zweites Mal
 * zu pflegen.
 */
function titleFromComment(body: string): string {
  const plain = previewText(body);
  const words = plain.split(' ').slice(0, 8).join(' ');
  return words.length < plain.length ? `${words}…` : words;
}

/**
 * Heutiges Datum als 'YYYY-MM-DD' aus den LOKALEN Datumsteilen -- Kopie von
 * todayIso() in document-detail.ts (dort ausführlich begründet: due_date ist
 * eine reine SQL-date-Spalte im selben Format, new Date().toISOString()
 * würde stattdessen auf UTC umrechnen und könnte rund um Mitternacht das
 * falsche Datum liefern).
 */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formatiert eine 'YYYY-MM-DD'-Fälligkeit OHNE über new Date() zu gehen -- siehe todayIso(). */
function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${MONTHS_ES[monthIdx] ?? m} ${y}`;
}

/** Siehe Entscheidung 9 im Dateikopf. */
function supportsInlinePreview(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return window.matchMedia('(min-width: 60rem)').matches;
}

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M6 2.5h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z" stroke-linejoin="round"/>' +
  '<path d="M14 2.5v4h4" stroke-linejoin="round"/></svg>';

/* ===========================================================================
   "+ Tarea" / "+ Nueva tarea" -- Kopie von taskFormDialog() aus
   document-detail.ts (dort nicht exportiert), siehe Entscheidung 12 im
   Dateikopf. Nutzt ausschließlich global geladene Klassen (.adm-dialog…,
   base.css über shell.css), kein zusätzlicher CSS-Import nötig.
   =========================================================================== */

let dialogSeq = 0;

interface ChatTaskFormOptions {
  dialogTitle: string;
  confirmLabel: string;
  prefillTitle?: string;
}

interface ChatTaskFormResult {
  title: string;
  assigneeId?: string;
  dueDate?: string;
}

function chatTaskFormDialog(profiles: ProfileRow[], opts: ChatTaskFormOptions): Promise<ChatTaskFormResult | null> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `chat-taskform-${(dialogSeq += 1)}`;

    const overlay = el('div', 'adm-dialog-backdrop');
    const dialog = el('div', 'adm-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', id);

    const title = el('h2', 'adm-dialog__title', opts.dialogTitle);
    title.id = id;
    dialog.append(title);

    const form = document.createElement('form');
    form.className = 'adm-dialog__form';
    form.noValidate = true;

    const titleField = el('div', 'adm-field');
    const titleLabel = el('label', 'adm-label', 'Título');
    titleLabel.htmlFor = `${id}-title`;
    const titleInput = el('input', 'adm-input');
    titleInput.id = `${id}-title`;
    titleInput.type = 'text';
    titleInput.required = true;
    titleInput.value = opts.prefillTitle ?? '';
    titleField.append(titleLabel, titleInput);
    form.append(titleField);

    const assigneeField = el('div', 'adm-field');
    const assigneeLabel = el('label', 'adm-label', 'Persona responsable (opcional)');
    assigneeLabel.htmlFor = `${id}-assignee`;
    const assigneeSelect = document.createElement('select');
    assigneeSelect.id = `${id}-assignee`;
    assigneeSelect.className = 'adm-input';
    assigneeSelect.append(new Option('Sin asignar', ''));
    for (const p of profiles) assigneeSelect.append(new Option(p.display_name, p.id));
    assigneeField.append(assigneeLabel, assigneeSelect);
    form.append(assigneeField);

    const dueField = el('div', 'adm-field');
    const dueLabel = el('label', 'adm-label', 'Fecha límite (opcional)');
    dueLabel.htmlFor = `${id}-due`;
    const dueInput = el('input', 'adm-input');
    dueInput.id = `${id}-due`;
    dueInput.type = 'date';
    dueField.append(dueLabel, dueInput);
    form.append(dueField);

    const actions = el('div', 'adm-dialog__actions');
    const cancelBtn = el('button', 'btn btn--ghost', 'Cancelar');
    cancelBtn.type = 'button';
    const confirmBtn = el('button', 'btn', opts.confirmLabel);
    confirmBtn.type = 'submit';
    actions.append(cancelBtn, confirmBtn);
    form.append(actions);
    dialog.append(form);
    overlay.append(dialog);

    let settled = false;
    const finish = (value: ChatTaskFormResult | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      overlay.classList.add('is-leaving');
      window.setTimeout(() => overlay.remove(), 200);
      if (opener && opener.isConnected) opener.focus();
      resolve(value);
    };

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    }

    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });
    cancelBtn.addEventListener('click', () => finish(null));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const t = titleInput.value.trim();
      if (!t) {
        titleInput.reportValidity();
        return;
      }
      finish({
        title: t,
        assigneeId: assigneeSelect.value || undefined,
        dueDate: dueInput.value || undefined,
      });
    });

    document.addEventListener('keydown', onKeydown, true);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-in');
      titleInput.focus();
      titleInput.select();
    });
  });
}

/* ===========================================================================
   "+ Subir" im Eingabebereich -- Kopie von uploadDialog() aus
   document-detail.ts (dort nicht exportiert), siehe Entscheidung 12 im
   Dateikopf (derselbe Grund wie bei chatTaskFormDialog()): Optik und Ablauf
   sollen exakt zusammenpassen. Nutzt dieselben CSS-Klassen
   (.docdet-uploaddialog, .docdet-modegroup…) aus document-detail.css -- in
   /admin ohnehin immer geladen (documents-view.ts importiert
   document-detail.ts), in der eigenständigen Chat-App explizit von
   chat-standalone.ts mitgeladen (dort schon für die Erwähnungs-Chips nötig).
   =========================================================================== */

interface ChatUploadDialogResult {
  file: File;
  note: string | undefined;
  mode: UploadMode;
  path: 'directo' | 'propuesta';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function chatUploadDialog(defaultMode: UploadMode): Promise<ChatUploadDialogResult | null> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `chat-upload-${(dialogSeq += 1)}`;

    const overlay = el('div', 'adm-dialog-backdrop');
    const dialog = el('div', 'adm-dialog docdet-uploaddialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', id);

    const title = el('h2', 'adm-dialog__title', 'Subir nueva versión');
    title.id = id;
    dialog.append(title);

    const form = document.createElement('form');
    form.className = 'adm-dialog__form';
    form.noValidate = true;

    // Datei
    const fileField = el('div', 'adm-field');
    fileField.append(el('label', 'adm-label', 'Archivo'));
    const fileInput = el('input', 'visually-hidden');
    fileInput.type = 'file';
    fileInput.tabIndex = -1;
    const pickBtn = el('button', 'btn btn--ghost', 'Elegir archivo');
    pickBtn.type = 'button';
    const fileName = el('p', 'docdet-uploaddialog__filename', 'Ningún archivo elegido todavía.');
    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0] ?? null;
      fileName.textContent = f ? `${f.name} · ${formatBytes(f.size)}` : 'Ningún archivo elegido todavía.';
      confirmDirectBtn.disabled = !f;
      confirmProposalBtn.disabled = !f;
    });
    fileField.append(pickBtn, fileName, fileInput);
    form.append(fileField);

    // Notiz
    const noteField = el('div', 'adm-field');
    const noteLabel = el('label', 'adm-label', '¿Qué cambió? (opcional)');
    noteLabel.htmlFor = `${id}-note`;
    const noteInput = document.createElement('textarea');
    noteInput.id = `${id}-note`;
    noteInput.className = 'adm-input';
    noteInput.rows = 2;
    noteInput.placeholder = 'Ej: se agregó el detalle de la escalera.';
    noteField.append(noteLabel, noteInput);
    form.append(noteField);

    // Modo -- Voreinstellung 'original' (siehe openUploadFromComposer()).
    let mode: UploadMode = defaultMode;
    const modeField = el('div', 'adm-field');
    modeField.append(el('label', 'adm-label', 'Cómo guardar el archivo'));
    const modeGroup = el('div', 'docdet-modegroup');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', 'Cómo guardar el archivo');
    const originalBtn = el('button', 'docdet-modegroup__btn', 'Mantener original');
    originalBtn.type = 'button';
    const fotoBtn = el('button', 'docdet-modegroup__btn', 'Tratar como foto');
    fotoBtn.type = 'button';
    const modeWarn = el(
      'p',
      'docdet-modegroup__warn',
      'Achica la imagen para siempre y la vuelve a guardar como JPEG. No lo uses con archivos de imprenta, ' +
        'planos u otros documentos que tienen que quedar exactamente como se subieron.',
    );
    modeWarn.hidden = true;

    function paintMode(): void {
      originalBtn.classList.toggle('is-on', mode === 'original');
      originalBtn.setAttribute('aria-pressed', String(mode === 'original'));
      fotoBtn.classList.toggle('is-on', mode === 'foto');
      fotoBtn.setAttribute('aria-pressed', String(mode === 'foto'));
      modeWarn.hidden = mode !== 'foto';
    }
    paintMode();
    originalBtn.addEventListener('click', () => {
      mode = 'original';
      paintMode();
    });
    fotoBtn.addEventListener('click', () => {
      mode = 'foto';
      paintMode();
    });
    modeGroup.append(originalBtn, fotoBtn);
    modeField.append(modeGroup, modeWarn);
    form.append(modeField);

    const pathHint = el(
      'p',
      'docdet-uploaddialog__pathhint',
      'Elegí cómo entra la nueva versión: directa, o como propuesta que alguien más tiene que aprobar.',
    );
    form.append(pathHint);

    const actions = el('div', 'adm-dialog__actions docdet-uploaddialog__actions');
    const cancelBtn = el('button', 'btn btn--ghost', 'Cancelar');
    cancelBtn.type = 'button';

    const confirmDirectBtn = el('button', 'btn btn--ghost', 'Establecer directamente');
    confirmDirectBtn.type = 'button';
    confirmDirectBtn.disabled = true;

    const confirmProposalBtn = el('button', 'btn', 'Subir como propuesta');
    confirmProposalBtn.type = 'submit';
    confirmProposalBtn.disabled = true;

    actions.append(cancelBtn, confirmDirectBtn, confirmProposalBtn);
    form.append(actions);
    dialog.append(form);
    overlay.append(dialog);

    let settled = false;
    const finish = (value: ChatUploadDialogResult | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      overlay.classList.add('is-leaving');
      window.setTimeout(() => overlay.remove(), 200);
      if (opener && opener.isConnected) opener.focus();
      resolve(value);
    };

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    }

    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });
    cancelBtn.addEventListener('click', () => finish(null));

    function submitWith(path: 'directo' | 'propuesta'): void {
      const file = fileInput.files?.[0];
      if (!file) return;
      finish({ file, note: noteInput.value.trim() || undefined, mode, path });
    }

    confirmDirectBtn.addEventListener('click', () => submitWith('directo'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitWith('propuesta');
    });

    document.addEventListener('keydown', onKeydown, true);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-in');
      pickBtn.focus();
    });
  });
}
