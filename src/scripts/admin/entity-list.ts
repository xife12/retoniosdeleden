import { confirmDialog } from './dialog';
import { humanError, isSessionCancelled } from './errors';
import { sortable } from './sortable';
import { toast } from './toast';
import type { Entity } from './store';
import '../../styles/admin/list.css';

/**
 * Listenansicht für Talleres und Casas -- einmal geschrieben, zweimal benutzt.
 *
 * v1 hatte für jede Inhaltsart eine eigene, fast gleiche Liste (Problem P14)
 * und zeigte darin nur Titel, Thema und Preis (P8). Hier steht, was man zum
 * Beurteilen braucht: Zustand, Kennzahlen, ob Englisch fehlt.
 *
 * Sortiert wird gezogen, nicht geklickt: ein UPDATE statt zwei, ohne
 * Neuladen (P9). „Eliminar" liegt im Überlaufmenü und fragt nach; der
 * empfohlene Weg ist Archivieren, mit Rückgängig-Toast (P7).
 */

export interface ListCard {
  /** Inneres SVG-Markup, viewBox 0 0 90 90. */
  art?: string;
  /** Bild-URL; hat Vorrang vor `art`. */
  thumb?: string;
  title: string;
  meta: string[];
  /** Ausgefüllte Pflichttexte je Sprache. */
  es: number;
  en: number;
  total: number;
}

type Filter = 'todos' | 'published' | 'draft' | 'archived';

export interface EntityListOptions<T extends Entity> {
  title: string;
  newLabel: string;
  emptyText: string;
  searchPlaceholder: string;
  load: () => Promise<T[]>;
  onNew: () => void;
  onOpen: (row: T) => void;
  onReorder: (row: T, newSortOrder: number) => Promise<void>;
  onArchive: (row: T, archived: boolean) => Promise<void>;
  onDelete: (row: T) => Promise<void>;
  nameOf: (row: T) => string;
  card: (row: T) => ListCard;
}

export interface EntityListView {
  el: HTMLElement;
  reload(): Promise<void>;
  destroy(): void;
}

/** Ab wie vielen Einträgen das Suchfeld erscheint. */
const SEARCH_FROM = 8;

const BADGE: Record<string, { text: string; cls: string }> = {
  draft: { text: 'Borrador', cls: 'draft' },
  published: { text: 'Publicado', cls: 'published' },
  archived: { text: 'Archivado', cls: 'archived' },
};

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

export function entityList<T extends Entity>(o: EntityListOptions<T>): EntityListView {
  const root = el('div', 'adm-list');

  let rows: T[] = [];
  let filter: Filter = 'todos';
  let query = '';

  /* ---------------- Kopf ---------------- */

  const head = el('header', 'adm-list__head');
  head.append(el('h1', 'adm-list__title', o.title));
  const newBtn = el('button', 'btn adm-list__new', o.newLabel);
  newBtn.type = 'button';
  newBtn.addEventListener('click', o.onNew);
  head.append(newBtn);
  root.append(head);

  /* ---------------- Suche und Filter ---------------- */

  const tools = el('div', 'adm-list__tools');
  const search = el('input', 'adm-input adm-list__search');
  search.type = 'search';
  search.placeholder = o.searchPlaceholder;
  search.setAttribute('aria-label', o.searchPlaceholder);
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  const chips = el('div', 'adm-list__filters');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Filtrar');
  const chipDefs: { value: Filter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'published', label: 'Publicados' },
    { value: 'draft', label: 'Borradores' },
    { value: 'archived', label: 'Archivados' },
  ];
  const chipButtons = chipDefs.map((def) => {
    const b = el('button', 'adm-list__filter', def.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      filter = def.value;
      for (const [i, other] of chipButtons.entries()) {
        const on = chipDefs[i].value === filter;
        other.classList.toggle('is-on', on);
        other.setAttribute('aria-pressed', String(on));
      }
      render();
    });
    chips.append(b);
    return b;
  });
  chipButtons[0].classList.add('is-on');
  chipButtons[0].setAttribute('aria-pressed', 'true');

  tools.append(chips, search);
  root.append(tools);

  /* ---------------- Kartenliste ---------------- */

  const listEl = el('ul', 'adm-list__items');
  const emptyEl = el('p', 'adm-list__empty', o.emptyText);
  root.append(listEl, emptyEl);

  /**
   * Standardmäßig bleibt Archiviertes aus dem Blick -- es ist bewusst von
   * der Website genommen und stört sonst die tägliche Arbeit.
   */
  function visible(): T[] {
    return rows.filter((r) => {
      if (filter === 'todos' ? r.status === 'archived' : r.status !== filter) return false;
      if (!query) return true;
      return o.nameOf(r).toLowerCase().includes(query);
    });
  }

  async function guard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      await reload();
    }
  }

  function buildCard(rowData: T): HTMLElement {
    const info = o.card(rowData);
    const li = el('li', 'adm-card');
    li.dataset.id = rowData.id;

    const handle = el('button', 'adm-card__handle');
    handle.type = 'button';
    handle.dataset.dragHandle = '';
    handle.setAttribute('aria-label', `Mover ${info.title}. Usá las flechas arriba y abajo.`);
    handle.innerHTML = '<span aria-hidden="true">⠿</span>';
    li.append(handle);

    const open = el('button', 'adm-card__open');
    open.type = 'button';
    open.addEventListener('click', () => o.onOpen(rowData));

    const media = el('span', 'adm-card__media');
    if (info.thumb) {
      const img = el('img');
      img.src = info.thumb;
      img.alt = '';
      img.loading = 'lazy';
      media.append(img);
    } else if (info.art) {
      media.innerHTML = `<svg viewBox="0 0 90 90" aria-hidden="true">${info.art}</svg>`;
    }
    open.append(media);

    const body = el('span', 'adm-card__body');
    const titleRow = el('span', 'adm-card__titlerow');
    titleRow.append(el('span', 'adm-card__title', info.title));
    const b = BADGE[rowData.status];
    if (b && !(rowData.status === 'published' && !rowData.has_unpublished_changes)) {
      titleRow.append(el('span', `adm-badge adm-badge--${b.cls}`, b.text));
    }
    if (rowData.status === 'published' && rowData.has_unpublished_changes) {
      titleRow.append(el('span', 'adm-badge adm-badge--published-dirty', 'Cambios sin publicar'));
    }
    body.append(titleRow);
    body.append(el('span', 'adm-card__meta', info.meta.join(' · ')));

    // Vollständigkeit je Sprache -- ohne den Editor öffnen zu müssen.
    const langs = el('span', 'adm-card__langs');
    for (const [code, done] of [['ES', info.es], ['EN', info.en]] as const) {
      const state = done === info.total ? 'ok' : done === 0 ? 'empty' : 'partial';
      const tag = el('span', `adm-card__lang is-${state}`, `${code} ${done}/${info.total}`);
      langs.append(tag);
    }
    body.append(langs);
    open.append(body);
    li.append(open);

    /* -------- Überlaufmenü: hier wohnt das Gefährliche -------- */

    const menuWrap = el('span', 'adm-card__menu');
    const menuBtn = el('button', 'adm-card__menubtn');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', `Más acciones para ${info.title}`);
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '<span aria-hidden="true">⋯</span>';

    const menu = el('div', 'adm-card__menulist');
    menu.hidden = true;

    const archived = rowData.status === 'archived';
    const archiveBtn = el('button', undefined, archived ? 'Publicar de nuevo' : 'Archivar');
    archiveBtn.type = 'button';
    archiveBtn.addEventListener('click', () => {
      closeMenu();
      void guard(async () => {
        await o.onArchive(rowData, !archived);
        toast(
          archived
            ? `“${info.title}” vuelve a la web.`
            : `“${info.title}” ya no se muestra en la web.`,
          {
            tone: 'ok',
            undo: () => guard(async () => {
              await o.onArchive(rowData, archived);
              await reload();
            }),
          },
        );
        await reload();
      });
    });

    const deleteBtn = el('button', 'adm-card__delete', 'Eliminar');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', () => {
      closeMenu();
      void (async () => {
        const ok = await confirmDialog({
          title: `¿Eliminar “${info.title}”?`,
          body: 'Se borra para siempre y no se puede deshacer. Si sólo querés sacarlo de la web, archivalo.',
          confirmLabel: 'Eliminar para siempre',
          tone: 'danger',
        });
        if (!ok) return;
        await guard(async () => {
          await o.onDelete(rowData);
          toast('Eliminado.', { tone: 'ok' });
          await reload();
        });
      })();
    });

    menu.append(archiveBtn, deleteBtn);

    function closeMenu(): void {
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      for (const other of listEl.querySelectorAll<HTMLElement>('.adm-card__menulist')) {
        other.hidden = true;
      }
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });

    menuWrap.append(menuBtn, menu);
    li.append(menuWrap);
    return li;
  }

  function render(): void {
    const items = visible();
    listEl.replaceChildren(...items.map(buildCard));
    emptyEl.hidden = items.length > 0;
    emptyEl.textContent = query
      ? 'Nada coincide con esa búsqueda.'
      : filter !== 'todos'
        ? 'No hay nada en este filtro.'
        : o.emptyText;
    search.hidden = rows.length < SEARCH_FROM;
  }

  function closeAllMenus(): void {
    for (const menu of listEl.querySelectorAll<HTMLElement>('.adm-card__menulist')) {
      menu.hidden = true;
    }
  }

  document.addEventListener('click', closeAllMenus);

  const sorter = sortable({
    list: listEl,
    onReorder: async (_from, _to, value) => {
      const id = listEl.children[_to] instanceof HTMLElement
        ? (listEl.children[_to] as HTMLElement).dataset.id
        : undefined;
      const moved = rows.find((r) => r.id === id);
      if (!moved) return;
      await guard(async () => {
        await o.onReorder(moved, value);
        moved.sort_order = value;
        rows.sort((a, b) => a.sort_order - b.sort_order);
      });
    },
    getSortOrders: () => visible().map((r) => r.sort_order),
    announce: (pos, total) => `Posición ${pos} de ${total}`,
  });

  async function reload(): Promise<void> {
    try {
      rows = await o.load();
      render();
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = humanError(err).message;
    }
  }

  return {
    el: root,
    reload,
    destroy() {
      document.removeEventListener('click', closeAllMenus);
      sorter.destroy();
      root.remove();
    },
  };
}
