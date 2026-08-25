import {
  acceptProposal,
  currentProfile,
  getDocument,
  listFolders,
  listProfiles,
  listVersions,
  reactivateVersion,
  rejectProposal,
  renameDocument,
  type CommentRow,
  type DocumentWithCurrentVersion,
  type FolderRow,
  type ProfileRow,
  type TaskRow,
  type UploadMode,
  type VersionRow,
} from './documents-store';
import { MAX_UPLOAD_BYTES, publishNewVersion, submitVersionProposal } from './documents-upload';
import {
  getDownloadUrl,
  getOriginalUrl,
  getThumbnailUrl,
  previewKindFor,
  shouldAutoload,
} from './documents-preview';
import { createComment, deleteComment, listComments, mentionsForVersion, updateComment } from './documents-comments';
import {
  insertMentionPlaceholder,
  mentionForVersion,
  renderCommentBody,
  type MentionCandidate,
} from './mentions';
import { attachMentionInput } from './mention-input';
import {
  createTask,
  createTaskFromComment,
  deleteTask,
  listTasksForDocument,
  markTaskDone,
  reopenTask,
} from './documents-tasks';
import { confirmDialog } from './dialog';
import { humanError, isSessionCancelled } from './errors';
import { navigate } from './router';
import { toast } from './toast';
import '../../styles/admin/document-detail.css';

/**
 * Detailansicht eines Dokuments (#/documentos/doc/<id>) -- Vorschau,
 * Versionsverlauf mit Vorschlägen, und das Hochladen neuer Fassungen. Das
 * letzte fehlende Stück der Dokumentenablage; alles andere (Ordner, Papier-
 * korb, Datenzugriff, Upload-Verarbeitung) ist schon fertig.
 *
 * Aufbau, Kommentarstil und wiederverwendete Bausteine an documents-view.ts
 * angelehnt (siehe dort für die ausführlichere Begründung von guard(),
 * closeAllMenus() usw.). Kommentare und Aufgaben (Plan Abschnitt 4.3, Phasen
 * 3+4) sind jetzt Teil dieser Datei -- eigene Abschnitte "Comentarios" und
 * "Tareas" unterhalb der Versionsliste, nach demselben
 * Container-Neubefüllungs-Muster wie der Rest der Ansicht (siehe unten,
 * commentsSection/tasksSection). Die Datenschicht dafür
 * (documents-comments.ts, documents-tasks.ts, mentions.ts) ist fertig und
 * NICHT Teil dieser Datei. Die @-Menü-Mechanik selbst (attachMentionInput())
 * steckt seit dem Phase-6-Refactoring in mention-input.ts -- wiederverwendet
 * vom kommenden Chat-Modul (Phase 7, baut ein anderer Agent), damit die
 * Tastenlogik nicht zweimal existiert. Hier bleibt nur noch der
 * dokumentspezifische Teil: localVersionCandidates() (Closure-Zugriff auf
 * `versions`) und die beiden Aufrufstellen (buildCommentForm(),
 * enterCommentEditMode()).
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE (von documents-view.ts benutzt)
 * ============================================================================
 *
 *   mountDocumentDetail(container: HTMLElement, documentId: string): Promise<void>
 *   unmountDocumentDetail(): void
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. Fehlermeldungen: wie in documents-view.ts (dort Entscheidung 1) --
 *    documents-store.ts/-upload.ts/-preview.ts liefern bereits übersetzte
 *    spanische Fehler. errorMessage() unten nimmt bei einem Error-Objekt
 *    direkt dessen `message`, humanError() dient nur als Rückfallebene.
 *
 * 2. Kein getFolder(id) im Store (siehe documents-view.ts, Entscheidung 2):
 *    für Brotkrumen-Titel und die Upload-Vorbelegung wird darum die oberste
 *    Ordnerebene komplett geladen und die passende Zeile herausgesucht --
 *    genau wie dort. Ist der Ordner (z. B. inzwischen gelöscht) nicht mehr
 *    auffindbar, fällt die Vorbelegung auf 'original' zurück (der sichere
 *    Standard) und die Brotkrumen-Beschriftung auf "Documentos".
 *
 * 3. textPromptDialog() und der Umgang mit humanError() sind bewusst aus
 *    documents-view.ts übernommen (dort nicht exportiert, deshalb hier
 *    dupliziert) -- Optik und Verhalten sollen zusammenpassen, siehe Auftrag.
 *
 * 4. Vorschau-Ladebremse (shouldAutoload/PREVIEW_AUTOLOAD_LIMIT, Plan
 *    Abschnitt 6): gilt nur für automatisches Laden. Ein Klick auf "Ver
 *    original" oder "Abrir en pestaña nueva" ist selbst schon die bewusste
 *    Handlung -- dort steht die Dateigröße nur zusätzlich in der
 *    Beschriftung, es gibt keinen zweiten Bestätigungsschritt obendrauf.
 *
 * 5. "Descargar" (Kopf, jede Version, jede abgelehnte Vorschlagszeile) öffnet
 *    die signierte Original-Adresse in einem neuen Tab (window.open). Die
 *    Datenschicht liefert keine erzwungene Content-Disposition (kein
 *    `download`-Parameter in documents-preview.ts::createSignedUrl()) --
 *    ob der Browser anzeigt oder herunterlädt, hängt vom Dateityp ab. Das ist
 *    eine Eigenschaft der (nicht anzufassenden) Datenschicht, kein Bug hier.
 *
 * 6. "Reactivar" fragt vorher über confirmDialog() nach (tone 'normal', nicht
 *    'danger' -- die Aktion überschreibt nichts und lässt sich durch erneutes
 *    Reaktivieren der anderen Version wieder rückgängig machen), erklärt aber
 *    ausdrücklich in Titel und Text, dass eine NEUE Version mit demselben
 *    Inhalt entsteht und nichts überschrieben wird (Plan Abschnitt 4.2).
 *
 * 7. Abgelehnte Vorschläge ohne (mehr) erreichbare Zielversion (targets_id
 *    zeigt auf nichts Sichtbares, z. B. nach einem Datenfehler) werden an das
 *    Ende der Versionsliste gehängt statt verschluckt -- "bleibt einsehbar"
 *    aus Plan Abschnitt 4.2 gilt uneingeschränkt.
 *
 * 8. Modus-Vorbelegung beim Hochladen: kommt aus dem Ordner (upload_mode),
 *    ist aber je Upload übersteuerbar (Segmented Control im Dialog, wie in
 *    documents-view.ts für den Ordner selbst) -- siehe Plan Abschnitt 7.
 *
 * 9. Eigene User-ID: über currentProfile() (documents-store.ts) im selben
 *    Promise.all()-Block wie Versionen/Profile geholt -- dieselbe Sitzung,
 *    ein einziger zusätzlicher Aufruf, kein eigenes currentUserId() hier
 *    dupliziert. Bestimmt, ob "Editar"/"Eliminar" bei einem Kommentar
 *    erscheinen (author_id === eigene ID).
 *
 * 10. Kommentare und Aufgaben laden NICHT blockierend: ein Fehler dort darf
 *     Vorschau/Versionen (die Kernfunktion) nicht verhindern -- anders als
 *     bei Versionen/Profilen oben, die weiterhin die ganze Seite blockieren,
 *     wenn sie fehlschlagen. reloadComments()/reloadTasks() fangen ihre
 *     eigenen Fehler darum selbst ab (Toast, Abschnitt bleibt einfach leer/
 *     veraltet) statt sie nach oben zu werfen.
 *
 * 11. Rückverweis "erwähnt im Kommentar von …" bezieht sich auf ALLE
 *     Versionen der Hauptliste (state 'current'/'superseded'/'rejected'),
 *     nicht auf Vorschläge -- ein Vorschlag hat noch keine feste Position im
 *     Verlauf, ihn schon vor der Entscheidung erwähnbar zu machen brächte
 *     nur verwaiste Verweise, sobald er abgelehnt/angenommen wird und seine
 *     Zeile sich ändert.
 *
 * 12. "Mencionar en un comentario" je Version/abgelehntem Vorschlag: nutzt
 *     mentionForVersion() aus mentions.ts, das laut dessen Dateikopf genau
 *     für diesen Fall exportiert wird ("Versionsliste schon offen, eine
 *     konkrete Zeile daraus erwähnen"). Ohne diesen Knopf gäbe es keinen Weg,
 *     eine Version zu erwähnen -- das @-Menü selbst durchsucht laut
 *     mentions.ts bewusst KEINE Versionen (dort Entscheidung 5). Schreibt
 *     direkt in das Hauptkommentarfeld (mainCommentTextarea) und fokussiert
 *     es; offene Bearbeitungsfelder einzelner Kommentare bleiben unberührt.
 *
 * 13. @-Menü-Positionierung: fest unterhalb des Eingabefelds (volle Breite),
 *     NICHT an der Cursor-Pixelposition -- eine Mini-Editor-Bibliothek für
 *     Caret-Koordinaten wäre für ein einzeiliges/zweizeiliges Kommentarfeld
 *     Overengineering (siehe Auftrag) und auf dem Handy ohnehin unzuverlässig
 *     (virtuelle Tastatur verschiebt den Viewport). Tastaturbedienung
 *     (Pfeiltasten, Enter, Escape) und ARIA (role="combobox"/"listbox",
 *     aria-activedescendant) sind trotzdem vollständig -- siehe
 *     attachMentionInput() in mention-input.ts.
 */

let teardown: (() => void) | null = null;

export async function mountDocumentDetail(container: HTMLElement, documentId: string): Promise<void> {
  const root = el('div', 'docdet-view');
  container.append(root);

  // Lade-Zustand, bevor überhaupt etwas zu zeigen ist -- ein leerer Bildschirm
  // während der ersten Abfrage wäre auf einer langsamen Mobilverbindung
  // verwirrend.
  const loadingEl = el('p', 'docdet-loading', 'Cargando documento…');
  root.append(loadingEl);

  let doc: DocumentWithCurrentVersion | null = null;
  let folder: FolderRow | null = null;
  let versions: VersionRow[] = [];
  let profiles: ProfileRow[] = [];
  let comments: CommentRow[] = [];
  let tasks: TaskRow[] = [];
  let ownUserId: string | null = null;
  // Rückverweis "erwähnt im Kommentar von …" je Version -- siehe Entscheidung
  // 11 im Dateikopf. Neu befüllt von reloadVersionMentionsQuiet().
  let versionMentions = new Map<string, Array<{ comment: CommentRow; documentId: string }>>();
  // Verweis auf das AKTUELLE Hauptkommentarfeld (nicht die Bearbeitungsfelder
  // einzelner Kommentare) -- wird bei jedem buildCommentForm()-Aufruf neu
  // gesetzt, siehe Entscheidung 12 im Dateikopf.
  let mainCommentTextarea: HTMLTextAreaElement | null = null;

  try {
    doc = await getDocument(documentId);
  } catch (err) {
    loadingEl.textContent = errorMessage(err);
    teardown = () => root.remove();
    return;
  }

  if (!doc) {
    toast('Ese documento ya no existe.', { tone: 'error' });
    navigate({ view: 'documentos' }, { replace: true });
    teardown = () => root.remove();
    return;
  }
  const activeDoc = doc;

  try {
    const all = await listFolders();
    folder = all.find((f) => f.id === activeDoc.folder_id) ?? null;
  } catch {
    // Siehe Entscheidung 2 im Dateikopf -- ein fehlgeschlagener Brotkrumen
    // darf die restliche Ansicht nicht blockieren.
    folder = null;
  }

  let ownProfile: ProfileRow | null = null;
  try {
    // currentProfile() im selben Block wie Versionen/Profile -- siehe
    // Entscheidung 9 im Dateikopf.
    [versions, profiles, ownProfile] = await Promise.all([
      listVersions(documentId),
      listProfiles(),
      currentProfile(),
    ]);
    ownUserId = ownProfile?.id ?? null;
  } catch (err) {
    loadingEl.textContent = errorMessage(err);
    teardown = () => root.remove();
    return;
  }

  loadingEl.remove();

  /* ------------------------------------------------------------------- *
   * Grundgerüst -- feste Container, die einzelne Abschnitte später für
   * sich neu befüllen (statt jedes Mal die ganze Seite neu zu bauen; das
   * würde bei jedem "Ver" den Bildlauf zurücksetzen).
   * ------------------------------------------------------------------- */

  const crumb = el('nav', 'docdet-crumb');
  const back = el('button', 'docdet-crumb__back', folder ? `‹ ${folder.name}` : '‹ Documentos');
  back.type = 'button';
  back.addEventListener('click', () =>
    navigate(folder ? { view: 'carpeta', id: folder.id } : { view: 'documentos' }),
  );
  crumb.append(back);
  root.append(crumb);

  const head = el('header', 'docdet-head');
  root.append(head);

  const previewSection = el('section', 'docdet-preview');
  previewSection.setAttribute('aria-label', 'Vista previa');
  root.append(previewSection);

  const uploadRow = el('div', 'docdet-uploadrow');
  const uploadBtn = el('button', 'btn', '+ Subir nueva versión');
  uploadBtn.type = 'button';
  uploadRow.append(uploadBtn);
  root.append(uploadRow);

  const versionsSection = el('section', 'docdet-versions-section');
  versionsSection.setAttribute('aria-label', 'Historial de versiones');
  root.append(versionsSection);

  const commentsSection = el('section', 'docdet-comments-section');
  commentsSection.setAttribute('aria-label', 'Comentarios');
  root.append(commentsSection);

  const tasksSection = el('section', 'docdet-tasks-section');
  tasksSection.setAttribute('aria-label', 'Tareas');
  root.append(tasksSection);

  /* ------------------------------------------------------------------- *
   * Hilfsmittel
   * ------------------------------------------------------------------- */

  function nameOf(userId: string): string {
    return profiles.find((p) => p.id === userId)?.display_name ?? 'Alguien';
  }

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      await reloadVersions();
    }
  }

  async function reloadVersions(): Promise<void> {
    try {
      versions = await listVersions(documentId);
      // Rückverweise VOR dem Rendern neu laden -- der Versionszustand kann
      // sich hier ändern (z. B. Vorschlag -> aktuell), siehe Entscheidung 11.
      await reloadVersionMentionsQuiet();
      const refreshed = await getDocument(documentId);
      // activeDoc bleibt dieselbe Objektreferenz (für Titel-Umbenennung
      // oben), bekommt hier aber den frischen Titel/Zustand nachgetragen --
      // sonst würde ein Neuladen nach z. B. "Aceptar" den zuvor lokal
      // gesetzten Titel wieder verlieren oder eine fremde Umbenennung nicht
      // zeigen.
      if (refreshed) {
        activeDoc.title = refreshed.title;
        activeDoc.currentVersion = refreshed.currentVersion;
        doc = refreshed;
      }
      renderHead();
      renderVersions();
      // Die aktive Vorschau zeigt weiter dieselbe Version, wenn sie noch
      // existiert (z. B. nach dem Umbenennen), sonst fällt sie auf die
      // aktuelle Version zurück.
      const stillThere = activeVersionId ? versions.find((v) => v.id === activeVersionId) : null;
      setActiveVersion(stillThere ?? doc?.currentVersion ?? null);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  /**
   * Wie guard(), aber OHNE reloadVersions() danach -- für Kommentar-/
   * Aufgaben-Aktionen, die die Versionsliste nicht betreffen (siehe
   * Entscheidung 10 im Dateikopf). reloadComments()/reloadTasks() fangen
   * ihre eigenen Ladefehler bereits selbst ab; guardSoft() schützt hier vor
   * allem die eigentliche Schreibaktion davor (createComment() usw.).
   */
  async function guardSoft(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
  }

  /**
   * Rückverweise "erwähnt im Kommentar von …" für alle sichtbaren Versionen
   * der Hauptliste (nicht Vorschläge, siehe Entscheidung 11). Wirft NIE --
   * ein Fehler hier ist Zusatzinfo, kein Grund, Versionsliste oder
   * restliches Nachladen zu blockieren.
   */
  async function reloadVersionMentionsQuiet(): Promise<void> {
    const relevant = versions.filter((v) => v.state !== 'proposal');
    if (relevant.length === 0) {
      versionMentions = new Map();
      return;
    }
    try {
      const results = await Promise.all(relevant.map((v) => mentionsForVersion(v.id)));
      versionMentions = new Map(relevant.map((v, i) => [v.id, results[i]]));
    } catch {
      versionMentions = new Map();
    }
  }

  /** Lädt Kommentare + Rückverweise neu und rendert beide Abschnitte. Wirft NIE, siehe Entscheidung 10. */
  async function reloadComments(): Promise<void> {
    try {
      comments = await listComments(documentId);
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
    await reloadVersionMentionsQuiet();
    renderComments();
    renderVersions();
  }

  /** Lädt Aufgaben neu und rendert den Abschnitt. Wirft NIE, siehe Entscheidung 10. */
  async function reloadTasks(): Promise<void> {
    try {
      tasks = await listTasksForDocument(documentId);
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
    renderTasks();
    // Der "Ver historial"-Aufklapper je Version zeigt auch Aufgaben --
    // ohne diesen Aufruf bliebe er nach z. B. "Convertir en tarea" veraltet.
    renderVersions();
  }

  /** Kurzes Aufblitzen, um eine per Sprung erreichte Zeile hervorzuheben. */
  function flash(target: HTMLElement): void {
    target.classList.add('docdet-flash');
    window.setTimeout(() => target.classList.remove('docdet-flash'), 1600);
  }

  /** Springt zu einer Version in der Hauptliste, falls sie gerade sichtbar ist (siehe Plan Phase 3). */
  function highlightVersion(versionId: string): void {
    const target = versionsSection.querySelector<HTMLElement>(`[data-version-id="${CSS.escape(versionId)}"]`);
    if (!target) return; // z. B. eine noch offene Vorschlagskarte -- dort gibt es kein data-version-id.
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(target);
  }

  /** Springt zu einem Kommentar in der Kommentarliste, falls er gerade sichtbar ist. */
  function highlightComment(commentId: string): void {
    const target = commentsSection.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(commentId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(target);
  }

  /**
   * Fügt eine Version als Erwähnung in das AKTUELLE Hauptkommentarfeld ein
   * und fokussiert es -- der Knopf "Mencionar en un comentario" je Version,
   * siehe Entscheidung 12 im Dateikopf.
   */
  function mentionVersionInComment(version: VersionRow): void {
    if (!mainCommentTextarea) return;
    const candidate = mentionForVersion(version);
    const cursorPos = mainCommentTextarea.selectionStart ?? mainCommentTextarea.value.length;
    const { text, cursorPos: newPos } = insertMentionPlaceholder(mainCommentTextarea.value, cursorPos, candidate);
    mainCommentTextarea.value = text;
    mainCommentTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mainCommentTextarea.focus();
    mainCommentTextarea.setSelectionRange(newPos, newPos);
  }

  /**
   * Erwähnungs-Kandidaten für die Versionen DIESES Dokuments -- ergänzt das
   * @-Menü, das global nur Personen und Dokumente durchsucht (mentions.ts,
   * Entscheidung 5: eine Versionsnummer ohne Dokumentkontext ergäbe in einer
   * globalen Suche keinen Sinn). Hier ist der Kontext aber schon klar --
   * die Versionsliste dieser Seite ist bereits geladen, also kostenlos
   * durchsuchbar, ohne Netzwerkaufruf. Vorschläge (noch keine Nummer)
   * bleiben außen vor, aus demselben Grund wie bei den Rückverweisen
   * (Entscheidung 11): sie haben noch keine feste Position im Verlauf.
   */
  function localVersionCandidates(): MentionCandidate[] {
    return versions.filter((v) => v.state !== 'proposal').map((v) => mentionForVersion(v));
  }

  /* ------------------------------------------------------------------- *
   * Kopf: Titel (umbenennbar), Versionsnummer, "Descargar"
   * ------------------------------------------------------------------- */

  function renderHead(): void {
    head.replaceChildren();
    const current = doc?.currentVersion ?? null;

    const titleRow = el('div', 'docdet-head__row');
    const title = el('h1', 'docdet-head__title', activeDoc.title);
    const renameBtn = el('button', 'docdet-head__rename');
    renameBtn.type = 'button';
    renameBtn.setAttribute('aria-label', 'Renombrar documento');
    renameBtn.innerHTML = PENCIL_ICON;
    renameBtn.addEventListener('click', () => {
      void (async () => {
        const value = await textPromptDialog({
          title: 'Renombrar documento',
          label: 'Título',
          value: activeDoc.title,
          confirmLabel: 'Guardar',
        });
        if (!value || value === activeDoc.title) return;
        await guard(async () => {
          await renameDocument(documentId, value);
          activeDoc.title = value;
          renderHead();
        });
      })();
    });
    titleRow.append(title, renameBtn);
    head.append(titleRow);

    const metaRow = el('div', 'docdet-head__meta');
    metaRow.append(
      el(
        'span',
        'docdet-head__version',
        current ? `Versión ${current.version_no ?? '·'}` : 'Sin versión actual',
      ),
    );
    if (current) {
      metaRow.append(
        el('span', 'docdet-head__by', `${nameOf(current.uploaded_by)} · ${formatDateTime(current.uploaded_at)}`),
      );
    }
    const downloadBtn = el('button', 'btn btn--ghost btn--sm', 'Descargar');
    downloadBtn.type = 'button';
    downloadBtn.disabled = !current;
    downloadBtn.addEventListener('click', () => {
      if (current) void downloadVersion(current);
    });
    metaRow.append(downloadBtn);
    head.append(metaRow);
  }

  /* ------------------------------------------------------------------- *
   * Vorschau (Plan Abschnitt 6)
   * ------------------------------------------------------------------- */

  let activeVersionId: string | null = null;

  function setActiveVersion(version: VersionRow | null): void {
    activeVersionId = version?.id ?? null;
    void renderPreview(version);
    renderVersions();
  }

  async function downloadVersion(version: VersionRow): Promise<void> {
    try {
      const url = await getDownloadUrl(version);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function openOriginalTab(version: VersionRow): Promise<void> {
    try {
      const url = await getOriginalUrl(version);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
  }

  /** Läuft bei jedem "Ver" neu -- Lade-/Bremszustand wird nie mitgeschleppt. */
  async function renderPreview(version: VersionRow | null): Promise<void> {
    previewSection.replaceChildren();

    if (!version) {
      previewSection.append(
        el(
          'p',
          'docdet-empty',
          'Este documento todavía no tiene ninguna versión. Subí un archivo para empezar.',
        ),
      );
      return;
    }

    const kind = previewKindFor(version);
    const big = formatMegabytes(version.byte_size);

    if (kind === 'pdf') {
      const frame = el('div', 'docdet-preview__frame');
      const openTabBtn = el('a', 'docdet-preview__opentab', 'Abrir en pestaña nueva ↗');
      openTabBtn.href = '#';
      openTabBtn.addEventListener('click', (event) => {
        event.preventDefault();
        void openOriginalTab(version);
      });

      if (shouldAutoload(version)) {
        await mountPdfFrame(frame, version);
      } else {
        frame.append(buildGateButton(big, () => void mountPdfFrame(frame, version)));
      }
      previewSection.append(frame, el('p', 'docdet-preview__hint', 'En iPhone/iPad, mejor abrir en pestaña nueva.'), openTabBtn);
      return;
    }

    if (kind === 'image') {
      const wrap = el('div', 'docdet-preview__imagewrap');
      const thumbUrl = await safeThumbnail(version);

      if (thumbUrl) {
        const img = el('img', 'docdet-preview__image');
        img.src = thumbUrl;
        img.alt = version.file_name;
        wrap.append(img);

        // "Ver original" allein war unklar, was der Knopf bewirkt (Auftrag).
        // Zwei Änderungen: ein Dauerhinweis erklärt VORHER, dass gerade eine
        // verkleinerte Vorschau zu sehen ist, und das Label sagt, was der
        // Klick konkret bringt (die Datei in voller Auflösung/Qualität).
        const hint = el(
          'p',
          'docdet-preview__hint',
          'Esta es una vista previa reducida. El archivo original no se modifica ni se comprime.',
        );
        const originalBtn = el(
          'button',
          'btn btn--ghost btn--sm',
          shouldAutoload(version) ? 'Ver en calidad original' : `Ver en calidad original (${big})`,
        );
        originalBtn.type = 'button';
        originalBtn.title = 'Carga el archivo tal cual se subió, sin la reducción de la vista previa.';
        originalBtn.addEventListener('click', () => {
          void (async () => {
            try {
              const url = await getOriginalUrl(version);
              img.src = url;
              originalBtn.disabled = true;
              hint.remove();
            } catch (err) {
              if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
            }
          })();
        });
        previewSection.append(wrap, hint, originalBtn);
        return;
      }

      // Kein Vorschaubild (kein Bild in dem Sinn, oder Erzeugung beim Upload
      // ist fehlgeschlagen, siehe documents-upload.ts) -- dieselbe Ladebremse
      // wie bei PDFs gilt dann fürs Original.
      async function loadOriginalInto(target: HTMLElement): Promise<void> {
        target.replaceChildren(el('p', 'docdet-preview__hint', 'Cargando…'));
        try {
          const img = el('img', 'docdet-preview__image');
          img.src = await getOriginalUrl(version);
          img.alt = version.file_name;
          target.replaceChildren(img);
        } catch (err) {
          if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
        }
      }

      if (shouldAutoload(version)) {
        previewSection.append(wrap);
        await loadOriginalInto(wrap);
      } else {
        previewSection.append(buildGateButton(big, () => void loadOriginalInto(wrap)), wrap);
      }
      return;
    }

    // 'other' -- Word, Excel usw.: nur Symbol, Größe, Datum, Download.
    const other = el('div', 'docdet-preview__other');
    const media = el('span', 'docdet-preview__othericon');
    media.innerHTML = FILE_ICON;
    other.append(media);
    const info = el('div', 'docdet-preview__otherinfo');
    info.append(el('p', 'docdet-preview__otherfile', version.file_name));
    info.append(el('p', 'docdet-preview__othermeta', `${formatBytes(version.byte_size)} · ${formatDateTime(version.uploaded_at)}`));
    const dl = el('button', 'btn btn--sm', 'Descargar');
    dl.type = 'button';
    dl.addEventListener('click', () => void downloadVersion(version));
    info.append(dl);
    other.append(info);
    previewSection.append(other);
  }

  async function mountPdfFrame(frame: HTMLElement, version: VersionRow): Promise<void> {
    try {
      const url = await getOriginalUrl(version);
      const iframe = document.createElement('iframe');
      iframe.className = 'docdet-preview__iframe';
      iframe.src = url;
      iframe.title = version.file_name;
      frame.replaceChildren(iframe);
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function safeThumbnail(version: VersionRow): Promise<string | null> {
    try {
      return await getThumbnailUrl(version);
    } catch {
      // Eine kaputte Vorschau-Adresse darf die Ansicht nicht sperren -- fällt
      // auf "kein Vorschaubild" zurück, dieselbe Behandlung wie oben.
      return null;
    }
  }

  /**
   * LADEBREMSE (Plan Abschnitt 6): ab PREVIEW_AUTOLOAD_LIMIT (5 MB) wird das
   * Original nicht automatisch gezogen, sondern erst nach diesem Klick. Ohne
   * diese Bremse kostet ein versehentlich geöffnetes 50-MB-Druck-PDF so viel
   * Datenverkehr wie zwanzig normale Dokumente -- bei einem monatlichen
   * Datenverkehrslimit von 5 GB im kostenlosen Supabase-Tarif (Plan
   * Abschnitt 7) ist das die wirksamste einzelne Gegenmaßnahme.
   */
  function buildGateButton(sizeLabel: string, onLoad: () => void): HTMLElement {
    const btn = el('button', 'btn docdet-preview__gate', `Vista previa (${sizeLabel}) — cargar`);
    btn.type = 'button';
    btn.addEventListener('click', () => onLoad(), { once: true });
    return btn;
  }

  /* ------------------------------------------------------------------- *
   * Versionsliste nach der Zustandsmaschine (Plan Abschnitt 4.2)
   * ------------------------------------------------------------------- */

  function renderVersions(): void {
    versionsSection.replaceChildren();

    const proposals = versions
      .filter((v) => v.state === 'proposal')
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());

    const numbered = versions
      .filter((v) => v.state === 'current' || v.state === 'superseded')
      .sort((a, b) => (b.version_no ?? 0) - (a.version_no ?? 0));

    const rejected = versions.filter((v) => v.state === 'rejected');
    const rejectedByTarget = new Map<string, VersionRow[]>();
    const orphanRejected: VersionRow[] = [];
    for (const r of rejected) {
      if (r.targets_id && numbered.some((v) => v.id === r.targets_id)) {
        const list = rejectedByTarget.get(r.targets_id) ?? [];
        list.push(r);
        rejectedByTarget.set(r.targets_id, list);
      } else {
        // Siehe Entscheidung 7 im Dateikopf: Zielversion nicht (mehr)
        // auffindbar -- trotzdem einsehbar, nur ohne Einrückung.
        orphanRejected.push(r);
      }
    }

    if (proposals.length > 0) {
      versionsSection.append(el('h2', 'docdet-section__title', 'Propuestas pendientes'));
      const list = el('div', 'docdet-proposals');
      for (const p of proposals) list.append(buildProposalCard(p));
      versionsSection.append(list);
    }

    versionsSection.append(el('h2', 'docdet-section__title', 'Versiones'));
    const list = el('ul', 'docdet-versions');
    if (numbered.length === 0) {
      list.append(el('li', 'docdet-empty', 'Todavía no hay versiones.'));
    }
    // `numbered` steht absteigend (neueste zuerst) -- der Nachbar EINEN
    // Index weiter vorn (i-1) ist damit die chronologisch nächstjüngere
    // Version. Deren uploaded_at markiert das Ende des Zeitfensters "so
    // lange war diese Version die vigente", für den Verlauf je Version
    // (buildVersionItem, siehe dort). Bei i===0 (die aktuelle Version) ist
    // das Fenster offen -- null bedeutet "bis jetzt".
    for (let i = 0; i < numbered.length; i++) {
      const v = numbered[i];
      const windowEndIso = i > 0 ? numbered[i - 1].uploaded_at : null;
      list.append(buildVersionItem(v, rejectedByTarget.get(v.id) ?? [], windowEndIso));
    }
    for (const r of orphanRejected) {
      list.append(buildVersionItem(null, [r]));
    }
    versionsSection.append(list);
  }

  function buildProposalCard(p: VersionRow): HTMLElement {
    const card = el('article', 'docdet-proposal');
    const badge = el('span', 'docdet-badge docdet-badge--proposal');
    badge.innerHTML = `${PROPOSAL_ICON}<span>Propuesta</span>`;
    card.append(badge);

    card.append(
      el('p', 'docdet-proposal__meta', `${nameOf(p.uploaded_by)} · ${formatDateTime(p.uploaded_at)} · ${formatBytes(p.byte_size)}`),
    );
    if (p.note) card.append(el('p', 'docdet-proposal__note', p.note));

    const actions = el('div', 'docdet-proposal__actions');
    const verBtn = el('button', 'btn btn--ghost btn--sm', 'Ver');
    verBtn.type = 'button';
    verBtn.addEventListener('click', () => setActiveVersion(p));

    const acceptBtn = el('button', 'btn btn--sm', 'Aceptar');
    acceptBtn.type = 'button';
    acceptBtn.addEventListener('click', () => {
      void guard(async () => {
        await acceptProposal(p.id);
        toast('Propuesta aceptada. Ahora es la versión vigente.', { tone: 'ok' });
        await reloadVersions();
      });
    });

    // adm-btn--danger liefert nur die Farbe; Form, Polsterung und Rand
    // kommen von .btn -- ohne die Klasse fällt der Knopf aus dem
    // Erscheinungsbild der übrigen Aktionsknöpfe.
    const rejectBtn = el('button', 'btn btn--sm adm-btn--danger', 'Rechazar');
    rejectBtn.type = 'button';

    actions.append(verBtn, acceptBtn, rejectBtn);
    card.append(actions);

    // Pflichtfeld für den Ablehnungsgrund -- erscheint erst nach "Rechazar",
    // und "Confirmar rechazo" lässt sich ohne Text nicht anklicken.
    const rejectForm = el('div', 'docdet-reject');
    rejectForm.hidden = true;
    const label = el('label', 'adm-label', 'Motivo del rechazo');
    const rejectId = `docdet-reject-${p.id}`;
    label.htmlFor = rejectId;
    const textarea = document.createElement('textarea');
    textarea.id = rejectId;
    textarea.className = 'adm-input docdet-reject__field';
    textarea.required = true;
    textarea.rows = 2;
    textarea.placeholder = 'Ej: la escala no coincide con el plano anterior.';
    const rejectActions = el('div', 'docdet-reject__actions');
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
      if (!reason) return; // Ohne Grund geht es nicht ab -- siehe Auftrag.
      void guard(async () => {
        await rejectProposal(p.id, reason);
        toast('Propuesta rechazada.', { tone: 'ok' });
        await reloadVersions();
      });
    });

    rejectBtn.addEventListener('click', () => {
      rejectForm.hidden = !rejectForm.hidden;
      if (!rejectForm.hidden) textarea.focus();
    });

    rejectActions.append(cancelRejectBtn, confirmRejectBtn);
    rejectForm.append(label, textarea, rejectActions);
    card.append(rejectForm);

    if (p.id === activeVersionId) card.classList.add('is-active');
    return card;
  }

  /**
   * Eine Zeile "Mencionado en un comentario de X" je Kommentar, der GENAU
   * DIESE Version erwähnt. Nur noch für abgelehnte Vorschläge (buildRejectedRow)
   * in Gebrauch -- normale Versionen zeigen dieselbe Information jetzt
   * ausführlicher (mit Kommentartext) im "Ver historial", siehe
   * buildHistorySection(). Abgelehnte Vorschläge haben kein eigenes
   * "Ver historial" (nie eine "vigente"-Zeitspanne gehabt), deshalb bleibt
   * hier die kompakte Verweiszeile die einzige Quelle dafür.
   */
  function buildVersionMentionLinks(versionId: string): HTMLElement[] {
    const mentions = versionMentions.get(versionId) ?? [];
    return mentions.map(({ comment }) => {
      const link = el(
        'button',
        'docdet-version__mentionlink',
        `Mencionado en un comentario de ${nameOf(comment.author_id)}`,
      );
      link.type = 'button';
      link.addEventListener('click', () => highlightComment(comment.id));
      return link;
    });
  }

  function buildVersionItem(
    version: VersionRow | null,
    rejectedHere: VersionRow[],
    windowEndIso: string | null = null,
  ): HTMLElement {
    const li = el('li', 'docdet-version');
    if (!version) {
      // Nur eine verwaiste abgelehnte Vorschlagszeile (Entscheidung 7).
      li.append(...rejectedHere.map(buildRejectedRow));
      return li;
    }

    const isCurrent = version.state === 'current';
    li.classList.add(isCurrent ? 'docdet-version--current' : 'docdet-version--superseded');
    if (version.id === activeVersionId) li.classList.add('is-active');
    // Sprungziel für "Mencionado en un comentario de …" beim Kommentar, und
    // für den Versions-Chip innerhalb eines gerenderten Kommentartexts.
    li.dataset.versionId = version.id;

    const row = el('div', 'docdet-version__row');
    const badge = el('span', `docdet-badge ${isCurrent ? 'docdet-badge--current' : 'docdet-badge--superseded'}`);
    badge.innerHTML = isCurrent
      ? `${CURRENT_ICON}<span>v${version.version_no ?? '·'} · Actual</span>`
      : `<span>v${version.version_no ?? '·'}</span>`;
    row.append(badge);

    const info = el('div', 'docdet-version__info');
    info.append(
      el('p', 'docdet-version__meta', `${nameOf(version.uploaded_by)} · ${formatDateTime(version.uploaded_at)} · ${formatBytes(version.byte_size)}`),
    );
    if (version.note) info.append(el('p', 'docdet-version__note', version.note));
    // KEINE separate "Mencionado en un comentario de …"-Zeile mehr hier --
    // eine explizite Erwähnung dieser Version landet jetzt direkt (mit
    // vollem Kommentartext) im "Ver historial" weiter unten, siehe
    // buildHistorySection(). Für abgelehnte Vorschläge (buildRejectedRow)
    // bleibt die kompakte Verweiszeile bestehen -- die haben kein eigenes
    // "Ver historial", weil sie nie eine "vigente"-Zeitspanne hatten.
    row.append(info);

    const actions = el('div', 'docdet-version__actions');
    const verBtn = el('button', 'btn btn--ghost btn--sm', 'Ver');
    verBtn.type = 'button';
    verBtn.addEventListener('click', () => setActiveVersion(version));
    actions.append(verBtn);

    const dlBtn = el('button', 'btn btn--ghost btn--sm', 'Descargar');
    dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => void downloadVersion(version));
    actions.append(dlBtn);

    // Kurzes Label ("Mencionar" statt "Mencionar en un comentario") für
    // kompaktere Reihen -- der volle Zweck steht im title-Tooltip.
    const mentionBtn = el('button', 'btn btn--ghost btn--sm', 'Mencionar');
    mentionBtn.type = 'button';
    mentionBtn.title = 'Mencionar esta versión en un comentario';
    mentionBtn.addEventListener('click', () => mentionVersionInComment(version));
    actions.append(mentionBtn);

    if (!isCurrent) {
      const reactivateBtn = el('button', 'btn btn--ghost btn--sm', 'Reactivar');
      reactivateBtn.type = 'button';
      reactivateBtn.addEventListener('click', () => {
        void (async () => {
          const ok = await confirmDialog({
            title: `¿Reactivar la versión ${version.version_no ?? ''}?`,
            body:
              'Se crea una versión NUEVA con el mismo archivo -- se vuelve la vigente. No se borra ni se ' +
              'sobrescribe nada: toda la historia sigue estando disponible, incluida esta versión.',
            confirmLabel: 'Reactivar',
          });
          if (!ok) return;
          await guard(async () => {
            await reactivateVersion(version.id);
            toast('Versión reactivada como la vigente.', { tone: 'ok' });
            await reloadVersions();
          });
        })();
      });
      actions.append(reactivateBtn);
    }
    row.append(actions);
    li.append(row);
    li.append(buildHistorySection(version, windowEndIso));

    for (const r of rejectedHere) li.append(buildRejectedRow(r));
    return li;
  }

  /**
   * "Ver historial" je Version -- aufklappbare Zeitleiste aus Kommentaren
   * und Aufgaben (Plan Abschnitt 4.4 / Phase 3: "Ereignisverlauf je Version
   * zum Aufklappen"). ZWEI Quellen fließen zusammen, EINE Liste:
   *
   *  1. Alles, was zeitlich in das Fenster fällt, in dem diese Version die
   *     vigente war -- auch ein Kommentar, der nur das Dokument (oder gar
   *     nichts) erwähnt, landet hier, weil er zeitlich dazugehört.
   *  2. Kommentare, die diese Version per @-Menü EXPLIZIT erwähnen, aber
   *     zeitlich in einem ANDEREN Fenster liegen -- der häufige Fall beim
   *     Hochladen einer neuen Fassung, wenn man rückwirkend auf eine ältere
   *     Version verweist. Ohne diese Zusammenführung wäre die alte Version
   *     blind für genau den Kommentar, der über sie geschrieben wurde (mit
   *     "mencionada acá" markiert, damit klar bleibt, warum der Eintrag
   *     zeitlich hier nicht "reingehört").
   *
   * Frühere Version dieser Ansicht zeigte (1) und (2) getrennt -- (2) nur
   * als inhaltslose "Mencionado en un comentario de …"-Zeile ohne
   * Kommentartext, mehrfach bei mehreren erwähnten Versionen. Das war
   * unübersichtlich, siehe Auftrag.
   *
   * Kostet KEINEN eigenen Netzwerkaufruf -- comments/tasks/versionMentions
   * sind für ihre eigenen Abschnitte schon vollständig geladen, hier wird
   * nur client-seitig gefiltert und zusammengeführt.
   */
  function buildHistorySection(version: VersionRow, windowEndIso: string | null): HTMLElement {
    const start = new Date(version.uploaded_at).getTime();
    const end = windowEndIso ? new Date(windowEndIso).getTime() : Number.POSITIVE_INFINITY;

    type HistoryItem = {
      at: string;
      kind: 'comment' | 'task';
      comment?: CommentRow;
      task?: TaskRow;
      viaMention?: boolean;
    };

    const windowComments = comments.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    });
    const windowCommentIds = new Set(windowComments.map((c) => c.id));

    // Explizite Erwähnungen dieser Version (@-Menü oder der "Mencionar"-
    // Knopf, siehe mentionVersionInComment) -- unabhängig vom Zeitfenster.
    // Beim Hochladen einer neuen Fassung wird oft rückwirkend auf eine
    // ÄLTERE Version verwiesen; der Kommentar dazu liegt zeitlich dann im
    // Fenster der NEUEN Version, nicht der erwähnten. Ohne diesen Zusatz
    // bliebe die alte Version blind für genau den Kommentar, der über sie
    // geschrieben wurde -- das war die gemeldete Unklarheit (vorher gab es
    // dafür nur eine separate, inhaltslose "Mencionado en ..."-Zeile).
    const mentioned = versionMentions.get(version.id) ?? [];
    const extraFromMentions: HistoryItem[] = mentioned
      .filter(({ comment }) => !windowCommentIds.has(comment.id))
      .map(({ comment }) => ({ at: comment.created_at, kind: 'comment', comment, viaMention: true }));

    const items: HistoryItem[] = [
      ...windowComments.map((c): HistoryItem => ({ at: c.created_at, kind: 'comment', comment: c })),
      ...extraFromMentions,
      ...tasks
        .filter((t) => {
          const tt = new Date(t.created_at).getTime();
          return tt >= start && tt < end;
        })
        .map((t): HistoryItem => ({ at: t.created_at, kind: 'task', task: t })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const details = document.createElement('details');
    details.className = 'docdet-history';
    const summary = document.createElement('summary');
    summary.className = 'docdet-history__summary';
    summary.textContent = items.length > 0 ? `Ver historial (${items.length})` : 'Ver historial';
    details.append(summary);

    const body = el('div', 'docdet-history__body');
    if (items.length === 0) {
      body.append(el('p', 'docdet-empty', 'No hay actividad registrada durante esta versión.'));
    } else {
      const list = el('ul', 'docdet-history__list');
      for (const item of items) list.append(buildHistoryItem(item));
      body.append(list);
    }
    details.append(body);
    return details;
  }

  function buildHistoryItem(item: {
    at: string;
    kind: 'comment' | 'task';
    comment?: CommentRow;
    task?: TaskRow;
    viaMention?: boolean;
  }): HTMLElement {
    const li = el('li', 'docdet-history__item');
    if (item.kind === 'comment' && item.comment) {
      const c = item.comment;
      const meta = el('p', 'docdet-history__meta', `${nameOf(c.author_id)} · ${formatDateTime(c.created_at)}`);
      // Nur markieren, wenn der Kommentar NICHT ohnehin zeitlich in diese
      // Version fällt -- sonst wäre die Markierung überflüssige Wiederholung
      // dessen, was aus der Zeitleiste schon offensichtlich ist.
      if (item.viaMention) meta.append(document.createTextNode(' · '), el('span', 'docdet-history__viatag', 'mencionada acá'));
      li.append(meta);
      const textEl = el('div', 'docdet-history__text');
      textEl.append(
        renderCommentBody(c.body, {
          onDocumentClick: (id) => {
            if (id !== documentId) navigate({ view: 'documento', id });
          },
          onVersionClick: (id) => highlightVersion(id),
        }),
      );
      li.append(textEl);
      const jump = el('button', 'docdet-version__mentionlink', 'Ir al comentario');
      jump.type = 'button';
      jump.addEventListener('click', () => highlightComment(c.id));
      li.append(jump);
    } else if (item.kind === 'task' && item.task) {
      const t = item.task;
      li.classList.add('docdet-history__item--task');
      li.append(
        el(
          'p',
          'docdet-history__meta',
          `Tarea · ${nameOf(t.created_by)} · ${formatDateTime(t.created_at)} · ${t.status === 'done' ? 'hecha' : 'pendiente'}`,
        ),
      );
      li.append(el('p', 'docdet-history__text', t.title));
    }
    return li;
  }

  function buildRejectedRow(r: VersionRow): HTMLElement {
    const row = el('div', 'docdet-rejected');
    row.dataset.versionId = r.id;
    const tag = el('span', 'docdet-badge docdet-badge--rejected');
    tag.innerHTML = `${REJECTED_ICON}<span>Propuesta rechazada</span>`;
    row.append(tag);

    const info = el('div', 'docdet-rejected__info');
    info.append(
      el(
        'p',
        'docdet-rejected__meta',
        `${nameOf(r.uploaded_by)} · ${formatDateTime(r.uploaded_at)}` +
          (r.decided_by ? ` · rechazada por ${nameOf(r.decided_by)} el ${formatDateTime(r.decided_at)}` : ''),
      ),
    );
    if (r.reject_reason) info.append(el('p', 'docdet-rejected__reason', r.reject_reason));
    info.append(...buildVersionMentionLinks(r.id));
    row.append(info);

    const actions = el('div', 'docdet-rejected__actions');
    const verBtn = el('button', 'btn btn--ghost btn--sm', 'Ver');
    verBtn.type = 'button';
    verBtn.addEventListener('click', () => setActiveVersion(r));
    const dlBtn = el('button', 'btn btn--ghost btn--sm', 'Descargar');
    dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => void downloadVersion(r));
    const mentionBtn = el('button', 'btn btn--ghost btn--sm', 'Mencionar');
    mentionBtn.type = 'button';
    mentionBtn.title = 'Mencionar esta versión en un comentario';
    mentionBtn.addEventListener('click', () => mentionVersionInComment(r));
    actions.append(verBtn, dlBtn, mentionBtn);
    row.append(actions);

    if (r.id === activeVersionId) row.classList.add('is-active');
    return row;
  }

  /* ------------------------------------------------------------------- *
   * Comentarios (Plan Phase 3) -- eine FLACHE, chronologisch aufsteigende
   * Liste auf Dokumentebene (nicht pro Version aufgeteilt), siehe Auftrag.
   * ------------------------------------------------------------------- */

  function renderComments(): void {
    commentsSection.replaceChildren();
    commentsSection.append(el('h2', 'docdet-section__title', 'Comentarios'));

    const list = el('ul', 'docdet-comments');
    if (comments.length === 0) {
      list.append(el('li', 'docdet-empty', 'Todavía no hay comentarios.'));
    }
    for (const c of comments) list.append(buildCommentItem(c));
    commentsSection.append(list);

    commentsSection.append(buildCommentForm());
  }

  function buildCommentItem(c: CommentRow): HTMLElement {
    const li = el('li', 'docdet-comment');
    // Sprungziel für "Mencionado en un comentario de …" bei der Zielversion.
    li.dataset.commentId = c.id;

    const head = el('div', 'docdet-comment__head');
    head.append(el('span', 'docdet-comment__author', nameOf(c.author_id)));
    head.append(
      el(
        'span',
        'docdet-comment__when',
        c.edited_at ? `${formatDateTime(c.created_at)} · editado` : formatDateTime(c.created_at),
      ),
    );
    li.append(head);

    const bodyWrap = el('div', 'docdet-comment__body');
    bodyWrap.append(
      renderCommentBody(c.body, {
        // Personen-Chip: laut Auftrag reicht rein visuelles Hervorheben --
        // ohne onPersonClick baut renderCommentBody() darum ein <span>
        // statt eines funktionslosen <button> (siehe mentions.ts, Entscheidung 7).
        onDocumentClick: (id) => {
          if (id !== documentId) navigate({ view: 'documento', id });
        },
        onVersionClick: (id) => highlightVersion(id),
      }),
    );
    li.append(bodyWrap);

    const actions = el('div', 'docdet-comment__actions');
    const isOwn = ownUserId !== null && c.author_id === ownUserId;

    if (isOwn) {
      const editBtn = el('button', 'btn btn--ghost btn--sm', 'Editar');
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => enterCommentEditMode(c, bodyWrap, actions));
      actions.append(editBtn);

      const delBtn = el('button', 'btn btn--ghost btn--sm', 'Eliminar');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        void (async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar este comentario?',
            body: 'Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar',
            tone: 'danger',
          });
          if (!ok) return;
          await guardSoft(async () => {
            await deleteComment(c.id);
            await reloadComments();
          });
        })();
      });
      actions.append(delBtn);
    }

    // "Convertir en tarea" auf EIGENEN und FREMDEN Kommentaren, wie im
    // Auftrag vorgegeben.
    const taskBtn = el('button', 'btn btn--ghost btn--sm', 'Convertir en tarea');
    taskBtn.type = 'button';
    taskBtn.addEventListener('click', () => openConvertToTaskDialog(c));
    actions.append(taskBtn);

    li.append(actions);
    return li;
  }

  /**
   * Tauscht die Anzeige eines eigenen Kommentars gegen ein Bearbeitungsfeld
   * (mit @-Menü) aus. Bricht guardSoft() beim Speichern ab, bleibt der Text
   * erhalten (kein renderComments(), das ihn verwerfen würde) -- nur bei
   * Erfolg oder "Cancelar" baut renderComments() die Liste neu auf.
   */
  function enterCommentEditMode(c: CommentRow, bodyWrap: HTMLElement, actionsEl: HTMLElement): void {
    const idPrefix = `docdet-commentedit-${c.id}`;
    bodyWrap.replaceChildren();
    actionsEl.hidden = true;

    const wrap = el('div', 'docdet-commentform__wrap');
    const textarea = document.createElement('textarea');
    textarea.className = 'adm-input docdet-commentform__field';
    textarea.rows = 2;
    textarea.value = c.body;
    const menu = el('div', 'docdet-mentionmenu');
    menu.id = `${idPrefix}-menu`;
    menu.hidden = true;
    wrap.append(textarea, menu);
    bodyWrap.append(wrap);

    attachMentionInput(textarea, menu, idPrefix, localVersionCandidates);

    const editActions = el('div', 'docdet-commentform__actions');
    const cancelBtn = el('button', 'btn btn--ghost', 'Cancelar');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => {
      actionsEl.hidden = false;
      renderComments();
    });
    const saveBtn = el('button', 'btn', 'Guardar');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const body = textarea.value.trim();
        if (!body) return;
        saveBtn.disabled = true;
        await guardSoft(async () => {
          await updateComment(c.id, body);
          await reloadComments();
        });
        saveBtn.disabled = false;
      })();
    });
    editActions.append(cancelBtn, saveBtn);
    bodyWrap.append(editActions);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function buildCommentForm(): HTMLElement {
    const idPrefix = 'docdet-commentform';
    const form = document.createElement('form');
    form.className = 'docdet-commentform';
    form.noValidate = true;

    const wrap = el('div', 'docdet-commentform__wrap');
    const label = el('label', 'visually-hidden', 'Comentario');
    label.htmlFor = `${idPrefix}-field`;
    const textarea = document.createElement('textarea');
    textarea.id = `${idPrefix}-field`;
    textarea.className = 'adm-input docdet-commentform__field';
    textarea.rows = 2;
    textarea.placeholder = 'Escribí un comentario… Usá @ para mencionar a alguien o un documento.';
    const menu = el('div', 'docdet-mentionmenu');
    menu.id = `${idPrefix}-menu`;
    menu.hidden = true;
    wrap.append(label, textarea, menu);
    form.append(wrap);

    attachMentionInput(textarea, menu, idPrefix, localVersionCandidates);
    // Referenz fürs "Mencionar en un comentario" bei einer Version, siehe
    // Entscheidung 12 im Dateikopf.
    mainCommentTextarea = textarea;

    const actions = el('div', 'docdet-commentform__actions');
    const submitBtn = el('button', 'btn', 'Comentar');
    submitBtn.type = 'submit';
    actions.append(submitBtn);
    form.append(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      void (async () => {
        submitBtn.disabled = true;
        await guardSoft(async () => {
          await createComment(documentId, body);
          textarea.value = '';
          await reloadComments();
        });
        submitBtn.disabled = false;
      })();
    });

    return form;
  }

  /* ------------------------------------------------------------------- *
   * Tareas (Plan Phase 4)
   * ------------------------------------------------------------------- */

  function renderTasks(): void {
    tasksSection.replaceChildren();

    const headRow = el('div', 'docdet-tasks-head');
    headRow.append(el('h2', 'docdet-section__title', 'Tareas'));
    const addBtn = el('button', 'btn btn--ghost', '+ Nueva tarea');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => openNewTaskDialog());
    headRow.append(addBtn);
    tasksSection.append(headRow);

    const open = tasks.filter((t) => t.status === 'open');
    const done = tasks.filter((t) => t.status === 'done');

    if (open.length === 0) {
      tasksSection.append(el('p', 'docdet-empty', 'No hay tareas abiertas.'));
    } else {
      const openList = el('ul', 'docdet-tasks');
      for (const t of open) openList.append(buildTaskItem(t));
      tasksSection.append(openList);
    }

    // Erledigte Aufgaben kompakt/eingeklappt darunter -- <details> ist von
    // Haus aus tastaturbedienbar (Enter/Leertaste auf dem fokussierten
    // <summary>), keine eigene JS-Logik nötig.
    if (done.length > 0) {
      const details = document.createElement('details');
      details.className = 'docdet-tasks-done';
      const summary = document.createElement('summary');
      summary.textContent = `Hechas (${done.length})`;
      details.append(summary);
      const doneList = el('ul', 'docdet-tasks docdet-tasks--done');
      for (const t of done) doneList.append(buildTaskItem(t));
      details.append(doneList);
      tasksSection.append(details);
    }
  }

  function buildTaskItem(t: TaskRow): HTMLElement {
    const li = el('li', 'docdet-task');
    const isDone = t.status === 'done';
    const isOverdue = !isDone && t.due_date !== null && t.due_date < todayIso();
    if (isDone) li.classList.add('docdet-task--done');
    if (isOverdue) li.classList.add('docdet-task--overdue');

    const info = el('div', 'docdet-task__info');
    info.append(el('p', 'docdet-task__title', t.title));
    const metaBits: string[] = [];
    if (t.assignee_id) metaBits.push(nameOf(t.assignee_id));
    metaBits.push(t.due_date ? formatDueDate(t.due_date) : 'Sin fecha');
    const metaP = el('p', 'docdet-task__meta', metaBits.join(' · '));
    if (isOverdue) {
      metaP.append(document.createTextNode(' · '), el('span', 'docdet-task__overduetag', 'Vencida'));
    }
    info.append(metaP);
    li.append(info);

    const actions = el('div', 'docdet-task__actions');
    const toggleBtn = el('button', 'btn btn--ghost btn--sm', isDone ? 'Reabrir' : 'Marcar como hecha');
    toggleBtn.type = 'button';
    toggleBtn.addEventListener('click', () => {
      void guardSoft(async () => {
        if (isDone) await reopenTask(t.id);
        else await markTaskDone(t.id);
        await reloadTasks();
      });
    });
    actions.append(toggleBtn);

    const delBtn = el('button', 'btn btn--ghost btn--sm', 'Eliminar');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => {
      void (async () => {
        const ok = await confirmDialog({
          title: '¿Eliminar esta tarea?',
          body: 'Esta acción no se puede deshacer.',
          confirmLabel: 'Eliminar',
          tone: 'danger',
        });
        if (!ok) return;
        await guardSoft(async () => {
          await deleteTask(t.id);
          await reloadTasks();
        });
      })();
    });
    actions.append(delBtn);
    li.append(actions);

    return li;
  }

  function openNewTaskDialog(): void {
    void (async () => {
      const result = await taskFormDialog(profiles, { dialogTitle: 'Nueva tarea', confirmLabel: 'Crear tarea' });
      if (!result) return;
      await guardSoft(async () => {
        await createTask({
          documentId,
          title: result.title,
          assigneeId: result.assigneeId,
          dueDate: result.dueDate,
        });
        toast('Tarea creada.', { tone: 'ok' });
        await reloadTasks();
      });
    })();
  }

  function openConvertToTaskDialog(comment: CommentRow): void {
    void (async () => {
      const result = await taskFormDialog(profiles, {
        dialogTitle: 'Convertir en tarea',
        confirmLabel: 'Crear tarea',
        prefillTitle: titleFromComment(comment.body),
      });
      if (!result) return;
      await guardSoft(async () => {
        await createTaskFromComment(comment, result.title, result.assigneeId, result.dueDate);
        toast('Tarea creada a partir del comentario.', { tone: 'ok' });
        await reloadTasks();
      });
    })();
  }

  /* ------------------------------------------------------------------- *
   * Neue Fassung hochladen (Plan Abschnitt 7)
   * ------------------------------------------------------------------- */

  uploadBtn.addEventListener('click', () => {
    void (async () => {
      const defaultMode: UploadMode = folder?.upload_mode ?? 'original';
      const result = await uploadDialog(defaultMode);
      if (!result) return;

      if (result.file.size > MAX_UPLOAD_BYTES) {
        toast(
          `Este archivo pesa ${formatMegabytes(result.file.size)} y supera el límite de 50 MB del plan ` +
            'gratuito de Supabase. Elegí un archivo más chico, o pedile a Maxi que revise el plan de almacenamiento.',
          { tone: 'error' },
        );
        return;
      }

      await guard(async () => {
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
        await reloadVersions();
      });
    })();
  });

  /* ------------------------------------------------------------------- *
   * Erstes Rendern
   * ------------------------------------------------------------------- */

  renderHead();
  renderVersions();
  // Kommentare/Aufgaben laden NICHT blockierend -- siehe Entscheidung 10 im
  // Dateikopf. reloadComments() rendert dabei die Versionsliste nochmal neu
  // (frische Rückverweise), reloadTasks() nur den Aufgabenabschnitt.
  await reloadComments();
  await reloadTasks();
  await renderPreview(doc.currentVersion);
  activeVersionId = doc.currentVersion?.id ?? null;
  renderVersions();

  teardown = () => root.remove();
}

export function unmountDocumentDetail(): void {
  teardown?.();
  teardown = null;
}

/* ===========================================================================
   Kleine Hilfsmittel -- an documents-view.ts angelehnt (siehe Entscheidung 3)
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

/** Siehe Entscheidung 1 im Dateikopf. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return humanError(err).message;
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

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
  );
}

/* ===========================================================================
   Symbole -- gleicher Strichstil wie documents-view.ts (viewBox 24, stroke
   1.5, currentColor), hier eigenständig, weil dort nicht exportiert.
   =========================================================================== */

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M6 2.5h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z" stroke-linejoin="round"/>' +
  '<path d="M14 2.5v4h4" stroke-linejoin="round"/></svg>';

const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M4 20l1-4.2L16.2 4.6a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8.2 19l-4.2 1z" stroke-linejoin="round" stroke-linecap="round"/></svg>';

const CURRENT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const PROPOSAL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const REJECTED_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6" stroke-linecap="round"/></svg>';

/* ===========================================================================
   Text-Eingabedialog -- Kopie von documents-view.ts::textPromptDialog()
   (dort nicht exportiert). Siehe Entscheidung 3 im Dateikopf.
   =========================================================================== */

let dialogSeq = 0;

interface TextPromptOptions {
  title: string;
  body?: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

function textPromptDialog(o: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `docdet-prompt-${(dialogSeq += 1)}`;

    const overlay = el('div', 'adm-dialog-backdrop');
    const dialog = el('div', 'adm-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', id);

    const title = el('h2', 'adm-dialog__title', o.title);
    title.id = id;
    dialog.append(title);
    if (o.body) dialog.append(el('p', 'adm-dialog__body', o.body));

    const form = document.createElement('form');
    form.className = 'adm-dialog__form';
    form.noValidate = true;

    const field = el('div', 'adm-field');
    const label = el('label', 'adm-label', o.label);
    label.htmlFor = `${id}-input`;
    const input = el('input', 'adm-input');
    input.id = `${id}-input`;
    input.type = 'text';
    input.value = o.value ?? '';
    input.required = true;
    if (o.placeholder) input.placeholder = o.placeholder;
    field.append(label, input);
    form.append(field);

    const actions = el('div', 'adm-dialog__actions');
    const cancelBtn = el('button', 'btn btn--ghost', o.cancelLabel ?? 'Cancelar');
    cancelBtn.type = 'button';
    const confirmBtn = el('button', 'btn', o.confirmLabel ?? 'Guardar');
    confirmBtn.type = 'submit';
    actions.append(cancelBtn, confirmBtn);
    form.append(actions);
    dialog.append(form);
    overlay.append(dialog);

    let settled = false;
    const finish = (value: string | null): void => {
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
      const value = input.value.trim();
      if (!value) {
        input.reportValidity();
        return;
      }
      finish(value);
    });

    document.addEventListener('keydown', onKeydown, true);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-in');
      input.focus();
      input.select();
    });
  });
}

/* ===========================================================================
   Upload-Dialog -- Datei, optionale Notiz, Modus, und die zwei Upload-Wege
   (Plan Abschnitt 7). Eigenes Gerüst nach demselben Muster wie
   textPromptDialog() oben, weil dialog.ts kein Formular mit Datei-Eingabe
   und zwei getrennten Bestätigungsknöpfen kennt.
   =========================================================================== */

interface UploadDialogResult {
  file: File;
  note: string | undefined;
  mode: UploadMode;
  path: 'directo' | 'propuesta';
}

function uploadDialog(defaultMode: UploadMode): Promise<UploadDialogResult | null> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `docdet-upload-${(dialogSeq += 1)}`;

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

    // Modo -- Voreinstellung IMMER "Mantener original" laut Ordner, siehe
    // Plan Abschnitt 7 (die wichtigste Regel dieses ganzen Dialogs).
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

    // Zwei klar unterschiedene Wege (Plan Abschnitt 4.2/7): "Subir como
    // propuesta" ist der zurückhaltendere, umkehrbare Weg -- deshalb hier
    // (wie bei confirmDialog()s tone "danger") die auffälligere Fläche,
    // während "Establecer directamente" (setzt sofort, ohne Abstimmung)
    // bewusst leiser auftritt.
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
    const finish = (value: UploadDialogResult | null): void => {
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

    function submit(path: 'directo' | 'propuesta'): void {
      const file = fileInput.files?.[0] ?? null;
      if (!file) return;
      finish({ file, note: noteInput.value.trim() || undefined, mode, path });
    }

    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });
    cancelBtn.addEventListener('click', () => finish(null));
    confirmDirectBtn.addEventListener('click', () => submit('directo'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit('propuesta');
    });

    document.addEventListener('keydown', onKeydown, true);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-in');
      pickBtn.focus();
    });
  });
}

/**
 * Ersetzt @[Label](typ:uuid)-Platzhalter durch "@Label" -- für die
 * Titel-Vorbelegung beim "Convertir en tarea"-Formular (Klartext, keine
 * Platzhalter im vorausgefüllten Titel). Eigenständige, einfachere
 * Mini-Version des in mentions.ts nicht exportierten Erkennungsmusters --
 * hier reicht ein reines String-Replace, kein DOM/keine Chip-Objekte nötig.
 * Kein Lookbehind (HANDOFF.md).
 */
function plainTextOf(body: string): string {
  return body.replace(/@\[([^\]]+)\]\((?:person|document|version):[0-9a-fA-F-]{36}\)/g, '@$1');
}

/** Titel-Vorbelegung "Convertir en tarea": die ersten Worte des Kommentars, siehe Auftrag. */
function titleFromComment(body: string): string {
  const plain = plainTextOf(body).replace(/\s+/g, ' ').trim();
  const words = plain.split(' ').slice(0, 8).join(' ');
  return words.length < plain.length ? `${words}…` : words;
}

/**
 * Heutiges Datum als 'YYYY-MM-DD' aus den LOKALEN Datumsteilen -- due_date
 * ist eine reine SQL-date-Spalte im selben Format (siehe documents-tasks.ts),
 * ein Vergleich per String funktioniert also direkt. new Date().toISOString()
 * würde stattdessen auf UTC umrechnen und könnte in Uruguay (UTC-3) rund um
 * Mitternacht das falsche Datum liefern -- deshalb dieser Umweg.
 */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Formatiert eine 'YYYY-MM-DD'-Fälligkeit OHNE über new Date() zu gehen --
 * dieselbe Zeitzonen-Falle wie bei todayIso() oben (new Date('YYYY-MM-DD')
 * wird als UTC-Mitternacht interpretiert). Stil angelehnt an
 * formatDateTime() ("Tag Monat(kurz) Jahr"), aber rein textuell aus dem
 * String zusammengesetzt.
 */
function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${MONTHS_ES[monthIdx] ?? m} ${y}`;
}

/* ===========================================================================
   "Nueva tarea" / "Convertir en tarea" -- gemeinsames Formular, weil beide
   dieselben drei Felder brauchen (Titel/Zuständige Person/Fälligkeitsdatum)
   und sich nur in Dialogtitel, Knopftext und optionaler Titel-Vorbelegung
   unterscheiden. Gleiches Gerüst wie textPromptDialog()/uploadDialog() oben.
   =========================================================================== */

interface TaskFormOptions {
  dialogTitle: string;
  confirmLabel: string;
  prefillTitle?: string;
}

interface TaskFormResult {
  title: string;
  assigneeId?: string;
  dueDate?: string;
}

function taskFormDialog(profiles: ProfileRow[], opts: TaskFormOptions): Promise<TaskFormResult | null> {
  return new Promise((resolve) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `docdet-taskform-${(dialogSeq += 1)}`;

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
    const finish = (value: TaskFormResult | null): void => {
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
