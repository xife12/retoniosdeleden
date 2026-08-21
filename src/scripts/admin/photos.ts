import {
  deleteCasaImage,
  fetchCasaImages,
  updateCasaImage,
  uploadCasaImage,
  type CasaImageRow,
} from './image-upload';
import { confirmDialog } from './dialog';
import { humanError, isSessionCancelled } from './errors';
import { pairedField } from './fields';
import { fractionalOrder, sortable } from './sortable';
import { toast } from './toast';
import type { CasaImageDraft } from './drafts';
import '../../styles/admin/photos.css';

/**
 * Fotoverwaltung der Lehmhäuser (Problem P11).
 *
 * v1 sperrte den Bereich mit dem Satz „Guardá la casa primero … para poder
 * agregar fotos" -- und brach damit genau den Hauptfall: ein neues Haus mit
 * Fotos anlegen. Hier existiert die Zeile schon, bevor der Editor aufgeht
 * (siehe `casas-view.ts`), also sind Fotos ab dem ersten Moment möglich.
 *
 * Hochgeladen wird verkleinert (image-upload.ts, unverändert aus v1) und
 * höchstens zu dritt gleichzeitig, damit ein Stapel Handyfotos die Leitung
 * nicht dichtmacht. Jede Datei meldet ihren Fehler einzeln.
 */

/** Wie viele Uploads gleichzeitig laufen dürfen. */
const PARALLEL = 3;

export interface PhotoManager {
  el: HTMLElement;
  /** Aktueller Stand für Vorschau und Entwurf. */
  items(): CasaImageDraft[];
  load(): Promise<void>;
  destroy(): void;
}

export interface PhotoManagerOptions {
  casaId: string;
  onChange: () => void;
}

function toDraft(row: CasaImageRow): CasaImageDraft {
  return {
    id: row.id,
    url: row.url,
    storagePath: row.storage_path,
    alt: { es: row.alt_es ?? '', en: row.alt_en ?? '' },
    sortOrder: Number(row.sort_order) || 0,
  };
}

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

export function photoManager(o: PhotoManagerOptions): PhotoManager {
  const root = el('div', 'adm-ph');
  let rows: CasaImageRow[] = [];

  /* ---------------- Ablegen, Auswählen, Einfügen ---------------- */

  const drop = el('div', 'adm-ph__drop');
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.className = 'visually-hidden';
  input.id = `ph-${o.casaId}`;

  const pick = el('label', 'btn btn--ghost adm-ph__pick', 'Elegir fotos');
  pick.htmlFor = input.id;

  drop.append(
    el('p', 'adm-ph__droptext', 'Arrastrá las fotos acá, pegalas con Ctrl+V o elegilas.'),
    pick,
    input,
  );

  const grid = el('div', 'adm-ph__grid');
  const empty = el('p', 'adm-ph__empty', 'Sin fotos todavía. La web muestra un dibujo de acuarela según el estado de la obra.');
  const progress = el('ul', 'adm-ph__progress');

  root.append(drop, progress, empty, grid);

  /* ---------------- Hochladen ---------------- */

  async function uploadAll(files: File[]): Promise<void> {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    let next = Math.max(0, ...rows.map((r) => Number(r.sort_order) || 0));
    const queue = images.map((file) => ({ file, order: (next += 10) }));
    let cursor = 0;

    async function worker(): Promise<void> {
      while (cursor < queue.length) {
        const job = queue[cursor++];
        const line = el('li', 'adm-ph__job', job.file.name);
        progress.append(line);
        try {
          const row = await uploadCasaImage(o.casaId, job.file, job.order);
          rows.push(row);
          render();
          o.onChange();
        } catch (err) {
          // Ein kaputtes Foto darf den Rest des Stapels nicht aufhalten.
          line.classList.add('is-error');
          line.textContent = `${job.file.name}: ${humanError(err).message}`;
          window.setTimeout(() => line.remove(), 8000);
          continue;
        }
        line.remove();
      }
    }

    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  }

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void uploadAll(files);
  });

  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
    void uploadAll(Array.from(event.dataTransfer?.files ?? []));
  });

  function onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) void uploadAll(files);
  }
  window.addEventListener('paste', onPaste);

  /* ---------------- Einzelnes Foto ---------------- */

  function card(row: CasaImageRow, index: number): HTMLElement {
    const wrap = el('div', 'adm-ph__item');
    wrap.dataset.id = row.id;

    const handle = el('button', 'adm-ph__handle');
    handle.type = 'button';
    handle.dataset.dragHandle = '';
    handle.setAttribute('aria-label', 'Mover foto. Usá las flechas arriba y abajo.');
    handle.innerHTML = '<span aria-hidden="true">⠿</span>';

    const img = el('img', 'adm-ph__thumb');
    img.src = row.url;
    img.alt = '';
    img.loading = 'lazy';

    const head = el('div', 'adm-ph__head');
    head.append(handle, img);
    if (index === 0) head.append(el('span', 'adm-ph__cover', 'Portada'));
    wrap.append(head);

    const alt = pairedField({
      label: 'Descripción de la foto',
      hint: 'Para quien no puede verla.',
      onInput: () => {
        void updateCasaImage(row.id, {
          alt_es: alt.get().es,
          alt_en: alt.get().en,
        }).catch(() => {
          /* Alt-Texte sind unkritisch; ein Fehlschlag darf nicht stören. */
        });
        row.alt_es = alt.get().es;
        row.alt_en = alt.get().en;
        o.onChange();
      },
    });
    alt.set({ es: row.alt_es ?? '', en: row.alt_en ?? '' });
    wrap.append(alt.el);

    const actions = el('div', 'adm-ph__actions');

    if (index > 0) {
      const cover = el('button', 'btn btn--ghost btn--sm', 'Usar como portada');
      cover.type = 'button';
      cover.addEventListener('click', () => {
        void (async () => {
          const first = Number(rows[0]?.sort_order) || 0;
          const value = first - 10;
          try {
            await updateCasaImage(row.id, { sort_order: value });
            row.sort_order = value;
            rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
            render();
            o.onChange();
          } catch (err) {
            if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
          }
        })();
      });
      actions.append(cover);
    }

    const remove = el('button', 'btn btn--ghost btn--sm adm-btn--danger', 'Quitar');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      void (async () => {
        const ok = await confirmDialog({
          title: '¿Quitar esta foto?',
          body: 'Se borra del almacenamiento y no se puede recuperar.',
          confirmLabel: 'Quitar',
          tone: 'danger',
        });
        if (!ok) return;
        try {
          await deleteCasaImage(row);
          rows = rows.filter((r) => r.id !== row.id);
          render();
          o.onChange();
          toast('Foto quitada.', { tone: 'ok' });
        } catch (err) {
          if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
        }
      })();
    });
    actions.append(remove);
    wrap.append(actions);

    return wrap;
  }

  function render(): void {
    rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    grid.replaceChildren(...rows.map(card));
    empty.hidden = rows.length > 0;
  }

  const sorter = sortable({
    list: grid,
    onReorder: async (_from, to) => {
      const id = (grid.children[to] as HTMLElement | undefined)?.dataset.id;
      const moved = rows.find((r) => r.id === id);
      if (!moved) return;
      const others = rows.filter((r) => r.id !== moved.id).map((r) => Number(r.sort_order));
      const value = fractionalOrder(others, to);
      try {
        await updateCasaImage(moved.id, { sort_order: value });
        moved.sort_order = value;
        render();
        o.onChange();
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    },
    getSortOrders: () => rows.map((r) => Number(r.sort_order)),
  });

  render();

  return {
    el: root,
    items: () => rows.map(toDraft),
    async load() {
      try {
        rows = await fetchCasaImages(o.casaId);
        render();
      } catch (err) {
        toast(humanError(err).message, { tone: 'error' });
      }
    },
    destroy() {
      window.removeEventListener('paste', onPaste);
      sorter.destroy();
      root.remove();
    },
  };
}
