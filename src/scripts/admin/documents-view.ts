import {
  createFolder,
  deleteFolderForever,
  listDocuments,
  listFolders,
  listProfiles,
  listTrashedDocuments,
  listTrashedFolders,
  renameDocument,
  renameFolder,
  restoreDocument,
  restoreFolder,
  setFolderSortOrder,
  setFolderUploadMode,
  trashDocument,
  trashFolder,
  type DocumentRow,
  type DocumentWithCurrentVersion,
  type FolderRow,
  type ProfileRow,
  type TaskRow,
  type UploadMode,
} from './documents-store';
import { MAX_UPLOAD_BYTES, purgeDocumentForever, uploadNewDocument } from './documents-upload';
import { listMyOpenTasks, listOpenTasksForFolder, markTaskDone, reopenTask } from './documents-tasks';
import { mountDocumentDetail, unmountDocumentDetail } from './document-detail';
import { mountChat, unmountChat } from './chat-view';
import { confirmDialog } from './dialog';
import { humanError, isSessionCancelled } from './errors';
import { navigate, type Route } from './router';
import { sortable } from './sortable';
import { toast } from './toast';
import '../../styles/admin/documents.css';

/**
 * Ordnerübersicht, Ordnerinhalt und Papierkorb der Dokumentenablage.
 * Aufbau und Kommentarstil an casas-view.ts/workshops-view.ts angelehnt, die
 * Listen selbst sind aber NICHT über entity-list.ts gebaut: dessen
 * `EntityListOptions` verlangt `status` (draft/published/archived) und
 * `has_unpublished_changes` -- Konzepte, die Ordner und Dokumente laut
 * PLAN-DOCUMENTOS.md gar nicht kennen (sie kennen nur "da" oder "im
 * Papierkorb"). Wiederverwendet wird stattdessen, was tatsächlich passt:
 * sortable.ts, toast.ts, dialog.ts, errors.ts sowie derselbe Karten-Blick
 * (Ziehgriff, Überlaufmenü) in eigenen `.docs-*`-Klassen.
 *
 * Dieses Modul montiert sich selbst über main.ts' `RoutedView`-Vertrag
 * (`mount(container, route)` statt `mountList`/`mountEditor` -- siehe dort),
 * weil die Ablage sechs gleichrangige Ansichten hat statt zwei Ebenen.
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. Fehlermeldungen: documents-store.ts::fail() (und documents-upload.ts,
 *    das dieselbe fail() benutzt) übersetzen Supabase-Fehler bereits selbst
 *    über errors.ts::humanError() und werfen ein fertiges `Error` mit
 *    spanischem Satz weiter. Ein zweiter Aufruf von humanError() hier würde
 *    genau diesen Satz erneut gegen die (englischen) Regeln prüfen, meist
 *    ohne Treffer, und ihn durch den generischen Fallback ersetzen -- die
 *    eigentliche, hilfreichere Meldung ginge verloren. errorMessage() unten
 *    nimmt deshalb bei einem Error-Objekt direkt dessen `message`; humanError()
 *    dient nur als Rückfallebene für den unwahrscheinlichen Fall eines noch
 *    nicht übersetzten Fehlers.
 *
 * 2. Ordner-Metadaten in der Ordnerinhalt-Ansicht: der Store hat kein
 *    `getFolder(id)`, nur `listFolders(parentId)`. Da die Oberfläche laut
 *    Auftrag zunächst nur eine Ordnerebene zeigt (Plan Abschnitt 11, Punkt 3
 *    -- dort offen gelassen, hier für diese Ansicht so entschieden), wird die
 *    oberste Ebene komplett geladen und die passende Zeile herausgesucht.
 *    Kostet eine zusätzliche Abfrage, bleibt aber korrekt, sobald echte
 *    Verschachtelung dazukommt (dann müsste hier stattdessen der Store um
 *    getFolder() erweitert werden).
 *
 * 3. Dokumentenanzahl je Ordner (Auftrag A verlangt sie): keine eigene
 *    Zähl-Funktion im Store, darum je Ordner ein listDocuments()-Aufruf
 *    parallel (Promise.all) -- genau das Muster, das casas-view.ts schon für
 *    die Miniaturbilder in der Liste benutzt.
 *
 * 4. Größenprüfung VOR dem Hochladen: uploadNewDocument() legt die
 *    Dokumentzeile an, BEVOR es die Datei verarbeitet und dabei die
 *    50-MB-Grenze prüft (siehe documents-upload.ts, Entscheidung E dort).
 *    Bei einer zu großen Datei bliebe sonst ein Dokument ganz ohne Version
 *    zurück ("Zwischenzustand", siehe documents-store.ts Entscheidung 6).
 *    Deshalb prüft diese Ansicht die Größe selbst, BEVOR sie
 *    uploadNewDocument() überhaupt aufruft.
 *
 * 5. Freies Textfeld (Ordner-/Dokumentname, Titel beim Hochladen): dialog.ts
 *    kennt nur confirmDialog() und reauthDialog(), keins mit Eingabefeld, und
 *    darf laut Auftrag nicht angefasst werden. textPromptDialog() unten baut
 *    darum ein eigenes, kleines Gerüst -- mit denselben `.adm-dialog…`-Klassen
 *    aus base.css (global über shell.css eingebunden) für dieselbe Optik, aber
 *    ohne dessen vollständige Fokus-Falle/Seitensperre zu verdoppeln: Escape
 *    und Klick auf den Hintergrund brechen ab, das reicht für ein einzelnes
 *    Pflichtfeld.
 *
 * 6. Ein Dokument ohne aktuelle Version (fehlgeschlagener Upload nach dem
 *    Anlegen der Zeile, siehe Punkt 4) wird nicht versteckt, sondern als
 *    "Subida incompleta" angezeigt und bleibt umbenennbar/löschbar -- sonst
 *    gäbe es eine Karteileiche, die nirgends auftaucht.
 */

let teardown: (() => void) | null = null;

export async function mount(container: HTMLElement, route: Route): Promise<void> {
  switch (route.view) {
    case 'documentos':
      await mountFolders(container);
      return;
    case 'carpeta':
      await mountFolderDocuments(container, route.id);
      return;
    case 'papelera':
      await mountTrash(container);
      return;
    case 'documento':
      await mountDocumentDetail(container, route.id);
      teardown = unmountDocumentDetail;
      return;
    case 'tareas':
      await mountMyTasks(container);
      return;
    case 'chat':
      // onClose: bisher gab es keine eigene Schließen-Fläche im Chat-Panel,
      // nur den Umweg über den "Documentos"-Knopf in der Kopfzeile -- dorthin
      // navigiert das × jetzt direkt (siehe chat-view.ts, Entscheidung zu
      // opts.onClose).
      await mountChat(container, { onClose: () => navigate({ view: 'documentos' }) });
      teardown = unmountChat;
      return;
    case 'personas':
      mountPlaceholder(container, 'Personas');
      return;
    default:
      // main.ts ruft mount() nur für Dokumenten-Routen auf (siehe
      // DOCUMENT_VIEWS dort) -- dieser Zweig ist nur zur Vollständigkeit da.
      return;
  }
}

export function unmount(): void {
  teardown?.();
  teardown = null;
}

/* ===========================================================================
   Kleine Hilfsmittel
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

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Dateiname ohne Endung, als Vorschlag für den Dokumenttitel. Kein Regex mit
 *  Lookbehind (bricht altes iOS Safari, siehe HANDOFF.md). */
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Heutiges Datum als 'YYYY-MM-DD' in Ortszeit -- selbes Format wie
 *  TaskRow.due_date, damit ein reiner Stringvergleich reicht (siehe
 *  documents-tasks.ts::compareDue()). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Eine Aufgabe ist überfällig, wenn ihre Fälligkeit vor heute liegt. */
function isOverdue(dueDate: string): boolean {
  return dueDate < todayIso();
}

/** Fälligkeitsdatum einer Aufgabe, lesbar formatiert. 'T00:00:00' verhindert,
 *  dass new Date() das reine Datum als UTC-Mitternacht liest und dadurch in
 *  einer Zeitzone westlich von UTC einen Tag zurückspringt. */
function formatDueDate(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Textkörper einer Aufgabenzeile -- gemeinsam für die ausklappbare
 * Ordnerübersicht und "Mis tareas" (dort mit Ordnername in `docLabel`, hier
 * ohne). Titel und Dokument/Zuständige/Fälligkeit stehen bewusst in EINER
 * kompakten Metazeile (statt drei gestapelten Zeilen wie zuvor) -- mit
 * potenziell vielen Aufgaben je Ordner zählt jede gesparte Zeile.
 *
 * `assigneeLabel` ist nur in der Ordnerübersicht sinnvoll: dort können
 * Aufgaben unterschiedlichen Personen zugewiesen sein, und genau DAS wollte
 * man auf einen Blick sehen. In "Mis tareas" wäre es immer der eigene Name
 * (die Liste zeigt ja nur die eigenen Aufgaben) -- deshalb dort weggelassen
 * (Parameter bleibt optional, Aufrufer entscheidet). Eine überfällige
 * Fälligkeit bekommt zusätzlich zur Farbe den Text "Vencida", nicht nur eine
 * andere Farbe (Barrierefreiheit).
 */
function buildTaskMain(
  title: string,
  docLabel: string,
  onOpenDocument: () => void,
  dueDate: string | null,
  assigneeLabel: string | null = null,
): HTMLElement {
  const main = el('div', 'docs-task__main');
  main.append(el('p', 'docs-task__title', title));

  const meta = el('div', 'docs-task__meta');
  const parts: HTMLElement[] = [];

  const docLink = el('button', 'docs-task__doclink', docLabel);
  docLink.type = 'button';
  docLink.addEventListener('click', onOpenDocument);
  parts.push(docLink);

  if (assigneeLabel) {
    parts.push(el('span', 'docs-task__assignee', `Para ${assigneeLabel}`));
  }

  if (dueDate) {
    const overdue = isOverdue(dueDate);
    const due = el('span', overdue ? 'docs-task__due docs-task__due--overdue' : 'docs-task__due');
    due.textContent = overdue
      ? `Vencida -- vencía el ${formatDueDate(dueDate)}`
      : `Vence el ${formatDueDate(dueDate)}`;
    parts.push(due);
  }

  // " · " als eigener Textknoten zwischen den Teilen -- CSS-Pseudoelemente
  // für Trenner wirken auf einem <button> (docLink) unzuverlässig.
  parts.forEach((part, i) => {
    if (i > 0) meta.append(document.createTextNode(' · '));
    meta.append(part);
  });
  main.append(meta);

  return main;
}

/** Profile werden selten geändert -- einmal je Seitenaufruf laden reicht. */
let profilesCache: Promise<ProfileRow[]> | null = null;
function loadProfiles(): Promise<ProfileRow[]> {
  if (!profilesCache) {
    profilesCache = listProfiles().catch((err) => {
      profilesCache = null;
      throw err;
    });
  }
  return profilesCache;
}

const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M3 6.5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" stroke-linejoin="round"/></svg>';

const DOC_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M6 2.5h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z" stroke-linejoin="round"/>' +
  '<path d="M14 2.5v4h4" stroke-linejoin="round"/></svg>';

/* ===========================================================================
   Überlaufmenü -- gemeinsam für Ordner- und Dokumentkarten
   =========================================================================== */

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function buildMenu(ariaLabel: string, items: MenuItem[]): HTMLElement {
  const wrap = el('span', 'docs-card__menu');
  const btn = el('button', 'docs-card__menubtn');
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span aria-hidden="true">⋯</span>';

  const menu = el('div', 'docs-card__menulist');
  menu.hidden = true;

  for (const item of items) {
    const b = el('button', item.danger ? 'docs-card__delete' : undefined, item.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      item.onClick();
    });
    menu.append(b);
  }

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = menu.hidden;
    closeAllMenus();
    menu.hidden = !opening;
    btn.setAttribute('aria-expanded', String(opening));
  });

  wrap.append(btn, menu);
  return wrap;
}

function closeAllMenus(): void {
  for (const m of document.querySelectorAll<HTMLElement>('.docs-card__menulist')) m.hidden = true;
  for (const b of document.querySelectorAll<HTMLElement>('.docs-card__menubtn[aria-expanded="true"]')) {
    b.setAttribute('aria-expanded', 'false');
  }
}

/* ===========================================================================
   Text-Eingabedialog -- siehe Entscheidung 5 im Dateikopf
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
    const id = `docs-prompt-${(dialogSeq += 1)}`;

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
   A) Ordnerübersicht (#/documentos)
   =========================================================================== */

async function mountFolders(container: HTMLElement): Promise<void> {
  const root = el('div', 'docs-view');

  const head = el('header', 'docs-head');
  head.append(el('h1', 'docs-head__title', 'Documentos'));
  const actions = el('div', 'docs-head__actions');
  const trashBtn = el('button', 'btn btn--ghost btn--sm', 'Papelera');
  trashBtn.type = 'button';
  trashBtn.addEventListener('click', () => navigate({ view: 'papelera' }));
  const newBtn = el('button', 'btn btn--sm', '+ Nueva carpeta');
  newBtn.type = 'button';
  actions.append(trashBtn, newBtn);
  head.append(actions);
  root.append(head);

  const listEl = el('ul', 'docs-list');
  const emptyEl = el('p', 'docs-empty', 'Todavía no hay carpetas. Creá la primera.');
  root.append(listEl, emptyEl);
  container.append(root);

  let folders: FolderRow[] = [];
  let counts = new Map<string, number>();

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      await reload();
    }
  }

  async function reload(): Promise<void> {
    try {
      folders = await listFolders();
      const pairs = await Promise.all(
        folders.map(async (f) => {
          try {
            const docs = await listDocuments(f.id);
            return [f.id, docs.length] as const;
          } catch {
            // Eine einzelne kaputte Zählung soll nicht die ganze Liste sperren.
            return [f.id, 0] as const;
          }
        }),
      );
      counts = new Map(pairs);
      render();
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = errorMessage(err);
    }
  }

  function buildCard(folder: FolderRow): HTMLElement {
    const li = el('li', 'docs-card');
    li.dataset.id = folder.id;

    const handle = el('button', 'docs-card__handle');
    handle.type = 'button';
    handle.dataset.dragHandle = '';
    handle.setAttribute('aria-label', `Mover ${folder.name}. Usá las flechas arriba y abajo.`);
    handle.innerHTML = '<span aria-hidden="true">⠿</span>';
    li.append(handle);

    const open = el('button', 'docs-card__open');
    open.type = 'button';
    open.addEventListener('click', () => navigate({ view: 'carpeta', id: folder.id }));
    const media = el('span', 'docs-card__media');
    media.innerHTML = FOLDER_ICON;
    open.append(media);
    const body = el('span', 'docs-card__body');
    body.append(el('span', 'docs-card__title', folder.name));
    const metaEl = el('span', 'docs-card__meta');
    body.append(metaEl);
    open.append(body);
    li.append(open);

    // Die Voreinstellung "Original behalten" / "Als Foto behandeln" stand
    // früher als eigener, immer sichtbarer Umschalter auf jeder Karte --
    // bei 50 Ordnern wäre das eine eigene Zeile pro Karte allein für eine
    // Einstellung, die fast immer beim sicheren Standard bleibt. Jetzt: nur
    // ein kurzes Warn-Badge, wenn "Foto" aktiv ist (der Modus, der Dateien
    // dauerhaft verkleinert -- SIEHE Plan Abschnitt 7 -- verdient trotzdem
    // Sichtbarkeit ohne Klick), der Wechsel selbst wandert ins "…"-Menü.
    function paintMeta(): void {
      const n = counts.get(folder.id) ?? 0;
      metaEl.replaceChildren(document.createTextNode(n === 1 ? '1 documento' : `${n} documentos`));
      if (folder.upload_mode === 'foto') {
        metaEl.append(document.createTextNode(' · '), el('span', 'docs-card__meta--warn', 'Foto'));
      }
    }
    paintMeta();

    function setMode(mode: UploadMode): Promise<void> {
      return guard(async () => {
        await setFolderUploadMode(folder.id, mode);
        folder.upload_mode = mode;
        paintMeta();
      });
    }

    li.append(
      buildMenu(`Más acciones para ${folder.name}`, [
        {
          label: folder.upload_mode === 'original' ? 'Tratar como foto' : 'Mantener original',
          onClick: () => {
            if (folder.upload_mode === 'original') {
              // Verkleinert künftige Uploads DAUERHAFT -- erst nach
              // ausdrücklicher Bestätigung, wie zuvor beim Segmented Control.
              void (async () => {
                const ok = await confirmDialog({
                  title: `¿Tratar como foto en “${folder.name}”?`,
                  body:
                    'Los archivos que se suban de ahora en más en esta carpeta se van a achicar de forma ' +
                    'permanente para ahorrar espacio. No lo uses si acá van a ir archivos de imprenta, planos u ' +
                    'otros documentos que tienen que quedar exactamente como se subieron.',
                  confirmLabel: 'Tratar como foto',
                  tone: 'danger',
                });
                if (!ok) return;
                await setMode('foto');
              })();
            } else {
              void setMode('original');
            }
          },
        },
        {
          label: 'Renombrar',
          onClick: () => {
            void (async () => {
              const name = await textPromptDialog({
                title: 'Renombrar carpeta',
                label: 'Nombre',
                value: folder.name,
                confirmLabel: 'Guardar',
              });
              if (!name || name === folder.name) return;
              await guard(async () => {
                await renameFolder(folder.id, name);
                folder.name = name;
                render();
              });
            })();
          },
        },
        {
          label: 'Eliminar',
          danger: true,
          onClick: () => {
            void (async () => {
              const ok = await confirmDialog({
                title: `¿Eliminar “${folder.name}”?`,
                body: 'Va a la papelera. Desde ahí se puede restaurar, o eliminar para siempre más adelante.',
                confirmLabel: 'Eliminar',
                tone: 'danger',
              });
              if (!ok) return;
              await guard(async () => {
                await trashFolder(folder.id);
                toast(`“${folder.name}” se movió a la papelera.`, {
                  tone: 'ok',
                  undo: () =>
                    guard(async () => {
                      await restoreFolder(folder.id);
                      await reload();
                    }),
                });
                await reload();
              });
            })();
          },
        },
      ]),
    );

    return li;
  }

  function render(): void {
    listEl.replaceChildren(...folders.map(buildCard));
    emptyEl.hidden = folders.length > 0;
  }

  newBtn.addEventListener('click', () => {
    void (async () => {
      const name = await textPromptDialog({
        title: 'Nueva carpeta',
        label: 'Nombre',
        placeholder: 'Ej: Planos, Contratos, Fotos de la obra…',
        confirmLabel: 'Crear',
      });
      if (!name) return;
      await guard(async () => {
        const folder = await createFolder(name);
        toast(`Carpeta “${folder.name}” creada.`, { tone: 'ok' });
        navigate({ view: 'carpeta', id: folder.id });
      });
    })();
  });

  const sorter = sortable({
    list: listEl,
    onReorder: async (_from, to, value) => {
      const id = listEl.children[to] instanceof HTMLElement ? (listEl.children[to] as HTMLElement).dataset.id : undefined;
      const moved = folders.find((f) => f.id === id);
      if (!moved) return;
      await guard(async () => {
        await setFolderSortOrder(moved.id, value);
        moved.sort_order = value;
        folders.sort((a, b) => a.sort_order - b.sort_order);
      });
    },
    getSortOrders: () => folders.map((f) => f.sort_order),
    announce: (pos, total) => `Posición ${pos} de ${total}`,
  });

  document.addEventListener('click', closeAllMenus);
  await reload();

  teardown = () => {
    document.removeEventListener('click', closeAllMenus);
    sorter.destroy();
    root.remove();
  };
}

/* ===========================================================================
   B) Dokumente in einem Ordner (#/documentos/carpeta/<id>)
   =========================================================================== */

async function mountFolderDocuments(container: HTMLElement, folderId: string): Promise<void> {
  // Siehe Entscheidung 2 im Dateikopf: kein getFolder(id) im Store, deshalb
  // die oberste Ebene laden und die passende Zeile suchen.
  let folder: FolderRow | null = null;
  try {
    const all = await listFolders();
    folder = all.find((f) => f.id === folderId) ?? null;
  } catch (err) {
    toast(errorMessage(err), { tone: 'error' });
  }
  if (!folder) {
    toast('Esa carpeta ya no existe.', { tone: 'error' });
    navigate({ view: 'documentos' }, { replace: true });
    return;
  }
  const activeFolder = folder;

  const root = el('div', 'docs-view');

  const crumb = el('nav', 'docs-crumb');
  const back = el('button', 'docs-crumb__back', '‹ Documentos');
  back.type = 'button';
  back.addEventListener('click', () => navigate({ view: 'documentos' }));
  crumb.append(back);
  root.append(crumb);

  const head = el('header', 'docs-head');
  head.append(el('h1', 'docs-head__title', activeFolder.name));
  const actions = el('div', 'docs-head__actions');
  const uploadBtn = el('button', 'btn', '+ Subir documento');
  uploadBtn.type = 'button';
  actions.append(uploadBtn);
  head.append(actions);
  root.append(head);

  const fileInput = el('input', 'visually-hidden');
  fileInput.type = 'file';
  fileInput.tabIndex = -1;
  root.append(fileInput);

  root.append(
    el(
      'p',
      'docs-hint',
      activeFolder.upload_mode === 'foto'
        ? 'Esta carpeta achica las fotos nuevas para siempre, para ahorrar espacio. No subas acá archivos de imprenta.'
        : 'Esta carpeta guarda los archivos tal cual se suben, sin tocarlos.',
    ),
  );

  // Ausklappbare Aufgabenübersicht (Plan Abschnitt 9, Phase 4). <details>/
  // <summary> ist von Haus aus tastaturbedienbar und braucht kein eigenes
  // Auf-/Zuklapp-Gerüst -- in dieser Datei gibt es noch keins, das man sonst
  // hätte nachbauen können. Zugeklappt geladen: listOpenTasksForFolder()
  // erst beim ERSTEN Aufklappen aufrufen (siehe Hinweis in
  // documents-tasks.ts), nicht schon beim Montieren der Ansicht.
  const tasksDetails = el('details', 'docs-collapse');
  const tasksSummary = el('summary', 'docs-collapse__summary');
  const tasksSummaryLabel = el('span', undefined, 'Tareas de esta carpeta');
  tasksSummary.append(tasksSummaryLabel);
  const tasksBody = el('div', 'docs-collapse__body');
  tasksDetails.append(tasksSummary, tasksBody);
  root.append(tasksDetails);

  let folderTasks: Array<TaskRow & { documentId: string; documentTitle: string }> = [];
  let folderTasksLoaded = false;
  let folderTasksLoading = false;

  function renderFolderTasks(): void {
    tasksSummaryLabel.textContent =
      folderTasks.length > 0 ? `Tareas de esta carpeta (${folderTasks.length})` : 'Tareas de esta carpeta';
    if (folderTasks.length === 0) {
      tasksBody.replaceChildren(el('p', 'docs-empty', 'No hay tareas pendientes en esta carpeta.'));
      return;
    }
    const list = el('ul', 'docs-list');
    list.append(...folderTasks.map(buildFolderTaskRow));
    tasksBody.replaceChildren(list);
  }

  function buildFolderTaskRow(task: TaskRow & { documentId: string; documentTitle: string }): HTMLElement {
    const li = el('li', 'docs-task');
    li.append(
      buildTaskMain(
        task.title,
        task.documentTitle,
        () => navigate({ view: 'documento', id: task.documentId }),
        task.due_date,
        task.assignee_id ? nameOf(task.assignee_id) : 'Sin asignar',
      ),
    );

    const doneBtn = el('button', 'btn btn--ghost btn--sm', 'Marcar hecha');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => {
      void guard(async () => {
        await markTaskDone(task.id);
        folderTasks = folderTasks.filter((t) => t.id !== task.id);
        renderFolderTasks();
        toast('Tarea completada.', {
          tone: 'ok',
          undo: () =>
            guard(async () => {
              await reopenTask(task.id);
              folderTasks = await listOpenTasksForFolder(folderId);
              renderFolderTasks();
            }),
        });
      });
    });
    li.append(doneBtn);
    return li;
  }

  tasksDetails.addEventListener('toggle', () => {
    if (!tasksDetails.open || folderTasksLoaded || folderTasksLoading) return;
    folderTasksLoading = true;
    tasksBody.replaceChildren(el('p', 'docs-empty', 'Cargando…'));
    void (async () => {
      try {
        folderTasks = await listOpenTasksForFolder(folderId);
        folderTasksLoaded = true;
        renderFolderTasks();
      } catch (err) {
        // folderTasksLoaded bleibt false: beim nächsten Auf-/Zuklappen wird
        // es einfach nochmal versucht, statt die Ansicht dauerhaft zu sperren.
        tasksBody.replaceChildren(el('p', 'docs-empty', errorMessage(err)));
      } finally {
        folderTasksLoading = false;
      }
    })();
  });

  const listEl = el('ul', 'docs-list');
  const emptyEl = el('p', 'docs-empty', 'Todavía no hay documentos en esta carpeta.');
  root.append(listEl, emptyEl);
  container.append(root);

  let documents: DocumentWithCurrentVersion[] = [];
  let profiles: ProfileRow[] = [];

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      await reload();
    }
  }

  async function reload(): Promise<void> {
    try {
      [documents, profiles] = await Promise.all([listDocuments(folderId), loadProfiles()]);
      render();
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = errorMessage(err);
    }
  }

  function nameOf(userId: string): string {
    return profiles.find((p) => p.id === userId)?.display_name ?? 'Alguien';
  }

  function buildCard(doc: DocumentWithCurrentVersion): HTMLElement {
    const li = el('li', 'docs-card');
    li.dataset.id = doc.id;

    const open = el('button', 'docs-card__open');
    open.type = 'button';
    open.addEventListener('click', () => navigate({ view: 'documento', id: doc.id }));
    const media = el('span', 'docs-card__media');
    media.innerHTML = DOC_ICON;
    open.append(media);

    const body = el('span', 'docs-card__body');
    body.append(el('span', 'docs-card__title', doc.title));
    const v = doc.currentVersion;
    if (v) {
      body.append(
        el(
          'span',
          'docs-card__meta',
          `v${v.version_no ?? '·'} · ${nameOf(v.uploaded_by)} · ${formatDateTime(v.uploaded_at)} · ${formatBytes(v.byte_size)}`,
        ),
      );
    } else {
      // Zwischenzustand: Dokumentzeile ohne Version, siehe Entscheidung 4/6 im Dateikopf.
      body.append(el('span', 'docs-card__meta docs-card__meta--warn', 'Subida incompleta -- sin versión'));
    }
    open.append(body);
    li.append(open);

    li.append(
      buildMenu(`Más acciones para ${doc.title}`, [
        {
          label: 'Renombrar',
          onClick: () => {
            void (async () => {
              const title = await textPromptDialog({
                title: 'Renombrar documento',
                label: 'Título',
                value: doc.title,
                confirmLabel: 'Guardar',
              });
              if (!title || title === doc.title) return;
              await guard(async () => {
                await renameDocument(doc.id, title);
                doc.title = title;
                render();
              });
            })();
          },
        },
        {
          label: 'Eliminar',
          danger: true,
          onClick: () => {
            void (async () => {
              const ok = await confirmDialog({
                title: `¿Eliminar “${doc.title}”?`,
                body: 'Va a la papelera. Desde ahí se puede restaurar.',
                confirmLabel: 'Eliminar',
                tone: 'danger',
              });
              if (!ok) return;
              await guard(async () => {
                await trashDocument(doc.id);
                toast(`“${doc.title}” se movió a la papelera.`, {
                  tone: 'ok',
                  undo: () =>
                    guard(async () => {
                      await restoreDocument(doc.id);
                      await reload();
                    }),
                });
                await reload();
              });
            })();
          },
        },
      ]),
    );

    return li;
  }

  function render(): void {
    listEl.replaceChildren(...documents.map(buildCard));
    emptyEl.hidden = documents.length > 0;
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0] ?? null;
    fileInput.value = '';
    if (!file) return;
    void (async () => {
      // Siehe Entscheidung 4 im Dateikopf: Größe VOR dem Anlegen der
      // Dokumentzeile prüfen, sonst bliebe bei einer zu großen Datei ein
      // Dokument ganz ohne Version zurück.
      if (file.size > MAX_UPLOAD_BYTES) {
        toast(
          `Este archivo pesa ${formatBytes(file.size)} y supera el límite de 50 MB del plan gratuito de ` +
            'Supabase. Elegí un archivo más chico, o pedile a Maxi que revise el plan de almacenamiento.',
          { tone: 'error' },
        );
        return;
      }
      const title = await textPromptDialog({
        title: 'Subir documento',
        label: 'Título',
        value: stripExtension(file.name),
        confirmLabel: 'Subir',
      });
      if (!title) return;
      await guard(async () => {
        const outcome = await uploadNewDocument({
          folderId,
          title,
          file,
          mode: activeFolder.upload_mode,
        });
        toast(
          outcome.wasDeduplicated
            ? 'Documento subido. Ya teníamos ese archivo -- no ocupa espacio de nuevo.'
            : 'Documento subido.',
          { tone: 'ok' },
        );
        await reload();
      });
    })();
  });

  document.addEventListener('click', closeAllMenus);
  await reload();

  teardown = () => {
    document.removeEventListener('click', closeAllMenus);
    root.remove();
  };
}

/* ===========================================================================
   C) Papierkorb (#/documentos/papelera)
   =========================================================================== */

async function mountTrash(container: HTMLElement): Promise<void> {
  const root = el('div', 'docs-view');

  const crumb = el('nav', 'docs-crumb');
  const back = el('button', 'docs-crumb__back', '‹ Documentos');
  back.type = 'button';
  back.addEventListener('click', () => navigate({ view: 'documentos' }));
  crumb.append(back);
  root.append(crumb, el('h1', 'docs-head__title', 'Papelera'));

  root.append(el('h2', 'docs-section__title', 'Carpetas eliminadas'));
  const foldersList = el('ul', 'docs-list');
  const foldersEmpty = el('p', 'docs-empty', 'No hay carpetas en la papelera.');
  root.append(foldersList, foldersEmpty);

  root.append(el('h2', 'docs-section__title', 'Documentos eliminados'));
  const docsList = el('ul', 'docs-list');
  const docsEmpty = el('p', 'docs-empty', 'No hay documentos en la papelera.');
  root.append(docsList, docsEmpty);
  container.append(root);

  let trashedFolders: FolderRow[] = [];
  let trashedDocs: DocumentRow[] = [];

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      await reload();
    }
  }

  async function reload(): Promise<void> {
    try {
      [trashedFolders, trashedDocs] = await Promise.all([listTrashedFolders(), listTrashedDocuments()]);
      render();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  function actionsRow(onRestore: () => void, onPurge: () => void): HTMLElement {
    const row = el('div', 'docs-card__trashactions');
    const restoreBtn = el('button', 'btn btn--ghost btn--sm', 'Restaurar');
    restoreBtn.type = 'button';
    restoreBtn.addEventListener('click', onRestore);
    const purgeBtn = el('button', 'docs-card__delete', 'Eliminar definitivamente');
    purgeBtn.type = 'button';
    purgeBtn.addEventListener('click', onPurge);
    row.append(restoreBtn, purgeBtn);
    return row;
  }

  function buildFolderRow(folder: FolderRow): HTMLElement {
    const li = el('li', 'docs-card docs-card--trashed');
    const body = el('span', 'docs-card__body');
    body.append(el('span', 'docs-card__title', folder.name));
    body.append(el('span', 'docs-card__meta', `Eliminada el ${formatDateTime(folder.deleted_at)}`));
    li.append(body);

    li.append(
      actionsRow(
        () => {
          void guard(async () => {
            await restoreFolder(folder.id);
            toast(`“${folder.name}” restaurada.`, { tone: 'ok' });
            await reload();
          });
        },
        () => {
          void (async () => {
            const ok = await confirmDialog({
              title: `¿Eliminar “${folder.name}” para siempre?`,
              body: 'No se puede deshacer.',
              confirmLabel: 'Eliminar para siempre',
              tone: 'danger',
            });
            if (!ok) return;
            await guard(async () => {
              try {
                await deleteFolderForever(folder.id);
              } catch (err) {
                // deleteFolderForever() schlägt mit einer Fremdschlüssel-
                // Meldung fehl, solange die Carpeta noch (auch gelöschte)
                // Dokumente enthält (siehe documents-store.ts, Entscheidung
                // 6) -- die generische Übersetzung dafür ("cambió mientras
                // trabajabas") passt hier nicht, deshalb eigene Meldung.
                const cause = err instanceof Error ? String(err.cause ?? '') : '';
                if (cause.includes('23503')) {
                  throw new Error(
                    'Esta carpeta todavía tiene documentos (activos o en la papelera). Eliminá primero esos documentos.',
                  );
                }
                throw err;
              }
              toast('Carpeta eliminada para siempre.', { tone: 'ok' });
              await reload();
            });
          })();
        },
      ),
    );
    return li;
  }

  function buildDocRow(doc: DocumentRow): HTMLElement {
    const li = el('li', 'docs-card docs-card--trashed');
    const body = el('span', 'docs-card__body');
    body.append(el('span', 'docs-card__title', doc.title));
    body.append(el('span', 'docs-card__meta', `Eliminado el ${formatDateTime(doc.deleted_at)}`));
    li.append(body);

    li.append(
      actionsRow(
        () => {
          void guard(async () => {
            await restoreDocument(doc.id);
            toast(`“${doc.title}” restaurado.`, { tone: 'ok' });
            await reload();
          });
        },
        () => {
          void (async () => {
            const ok = await confirmDialog({
              title: `¿Eliminar “${doc.title}” para siempre?`,
              body: 'Se borran también todas sus versiones guardadas. No se puede deshacer.',
              confirmLabel: 'Eliminar para siempre',
              tone: 'danger',
            });
            if (!ok) return;
            await guard(async () => {
              // purgeDocumentForever() räumt zuerst die Storage-Dateien ab
              // (nur wenn keine andere Version mehr draufzeigt) und erst
              // danach die Datenbankzeile -- siehe documents-upload.ts. NIE
              // deleteDocumentForever() direkt hier aufrufen.
              await purgeDocumentForever(doc);
              toast('Documento eliminado para siempre.', { tone: 'ok' });
              await reload();
            });
          })();
        },
      ),
    );
    return li;
  }

  function render(): void {
    foldersList.replaceChildren(...trashedFolders.map(buildFolderRow));
    foldersEmpty.hidden = trashedFolders.length > 0;
    docsList.replaceChildren(...trashedDocs.map(buildDocRow));
    docsEmpty.hidden = trashedDocs.length > 0;
  }

  await reload();
  teardown = () => root.remove();
}

/* ===========================================================================
   D) Meine Aufgaben, ordnerübergreifend (#/documentos/tareas)
   =========================================================================== */

type MyTask = TaskRow & { documentId: string; documentTitle: string; folderId: string; folderName: string };

async function mountMyTasks(container: HTMLElement): Promise<void> {
  const root = el('div', 'docs-view');

  const crumb = el('nav', 'docs-crumb');
  const back = el('button', 'docs-crumb__back', '‹ Documentos');
  back.type = 'button';
  back.addEventListener('click', () => navigate({ view: 'documentos' }));
  crumb.append(back);
  root.append(crumb);

  const head = el('header', 'docs-head');
  head.append(el('h1', 'docs-head__title', 'Mis tareas'));
  root.append(head);

  const listEl = el('ul', 'docs-list');
  // Ein leerer Zustand ist hier ein GUTER Zustand -- freundlich formuliert,
  // nicht wie ein Fehler oder eine leere Suche.
  const emptyEl = el('p', 'docs-empty', 'No tenés tareas pendientes.');
  root.append(listEl, emptyEl);

  // Kurzer Bestätigungsbereich für gerade erledigte Aufgaben, mit Rückgängig
  // -- dasselbe Papierkorb-Muster (toast+undo), das trashFolder()/
  // trashDocument() oben schon benutzen, nur ohne eigene Route: die Aufgabe
  // ist ja nicht "weg", nur erledigt, und bleibt hier kurz sichtbar.
  const recentSection = el('section', 'docs-recent');
  recentSection.hidden = true;
  recentSection.append(el('h2', 'docs-recent__title', 'Recién completadas'));
  const recentList = el('ul', 'docs-recent__list');
  recentSection.append(recentList);
  root.append(recentSection);

  container.append(root);

  let tasks: MyTask[] = [];
  let recentlyDone: MyTask[] = [];

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      await reload();
    }
  }

  async function reload(): Promise<void> {
    try {
      tasks = await listMyOpenTasks();
      recentlyDone = [];
      render();
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = errorMessage(err);
    }
  }

  /** Macht "Marcar hecha" rückgängig -- ruft reload(), damit die Liste danach
   *  wieder exakt dem Server entspricht (und "Recién completadas" sich leert). */
  function undoDone(task: MyTask): Promise<void> {
    return guard(async () => {
      await reopenTask(task.id);
      await reload();
    });
  }

  function buildTaskRow(task: MyTask): HTMLElement {
    const li = el('li', 'docs-task');
    li.append(
      buildTaskMain(
        task.title,
        `${task.folderName || 'Carpeta'} · ${task.documentTitle}`,
        () => navigate({ view: 'documento', id: task.documentId }),
        task.due_date,
      ),
    );

    const doneBtn = el('button', 'btn btn--ghost btn--sm', 'Marcar hecha');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => {
      void guard(async () => {
        await markTaskDone(task.id);
        tasks = tasks.filter((t) => t.id !== task.id);
        // Nur die letzten paar zeigen -- das ist eine kurze Bestätigung,
        // kein dauerhaftes Verzeichnis erledigter Aufgaben.
        recentlyDone = [task, ...recentlyDone].slice(0, 5);
        render();
        toast('Tarea completada.', { tone: 'ok', undo: () => undoDone(task) });
      });
    });
    li.append(doneBtn);
    return li;
  }

  function buildRecentRow(task: MyTask): HTMLElement {
    const li = el('li', 'docs-recent__item');
    li.append(el('span', 'docs-recent__item-title', task.title));
    const undoBtn = el('button', 'btn btn--ghost btn--sm', 'Deshacer');
    undoBtn.type = 'button';
    undoBtn.addEventListener('click', () => void undoDone(task));
    li.append(undoBtn);
    return li;
  }

  function render(): void {
    listEl.replaceChildren(...tasks.map(buildTaskRow));
    emptyEl.hidden = tasks.length > 0;
    recentSection.hidden = recentlyDone.length === 0;
    recentList.replaceChildren(...recentlyDone.map(buildRecentRow));
  }

  await reload();

  teardown = () => root.remove();
}

/* ===========================================================================
   Platzhalter -- Personas kommt in einer späteren Phase
   =========================================================================== */

function mountPlaceholder(container: HTMLElement, title: string): void {
  const root = el('div', 'docs-view docs-placeholder');
  root.append(el('h1', 'docs-head__title', title));
  root.append(el('p', 'docs-placeholder__text', 'Próximamente.'));
  container.append(root);
  teardown = () => root.remove();
}
