import { sortable } from './sortable';
import { toast } from './toast';
import '../../styles/admin/base.css';

/**
 * Listen-Editor für wiederholbare Blöcke: Programmschritte, Inklusivleistungen,
 * Mitbringliste, Ausstattung, Highlights.
 *
 * Ersetzt `repeater.ts` und behebt dessen Schwächen (Problem P10):
 * - eine neu angelegte Zeile bekommt sofort den Fokus, statt stumm unten
 *   anzuhängen,
 * - es gibt einen echten Leerzustand statt einer leeren Fläche,
 * - Entfernen ist über einen Toast zurücknehmbar, nicht endgültig,
 * - umsortiert wird gezogen statt über Auf/Ab-Knöpfe,
 * - der tote Nummerierungscode (`[data-rep-index]`, das nie erzeugt wurde)
 *   fällt weg; Nummern vergibt jetzt die CSS über einen Zähler.
 *
 * Die Zeilen selbst kommen von außen (`renderRow`) -- meist ein gepaartes
 * ES/EN-Feld, damit Spanisch und Englisch nicht wie früher in getrennten
 * Listen unterschiedlich lang werden können.
 */

export interface ListRow<T> {
  el: HTMLElement;
  read: () => T;
  focus: () => void;
}

export interface ListEditor<T> {
  el: HTMLElement;
  setItems(v: T[]): void;
  getItems(): T[];
  destroy(): void;
}

export interface ListEditorOptions<T> {
  addLabel: string;
  /** Was dasteht, solange die Liste leer ist. */
  emptyText: string;
  createEmpty: () => T;
  renderRow: (item: T, api: { onInput: () => void }) => ListRow<T>;
  onChange?: () => void;
  /** Obergrenze; ist sie erreicht, wird der Hinzufügen-Knopf gesperrt. */
  max?: number;
  /** Beschriftung des Entfernen-Knopfes im Toast, z. B. „paso". */
  itemNoun?: string;
}

export function listEditor<T>(o: ListEditorOptions<T>): ListEditor<T> {
  const noun = o.itemNoun ?? 'elemento';

  const el = document.createElement('div');
  el.className = 'adm-le';

  const rowsEl = document.createElement('div');
  rowsEl.className = 'adm-le__rows';

  const empty = document.createElement('p');
  empty.className = 'adm-le__empty';
  empty.textContent = o.emptyText;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--ghost adm-le__add';
  addBtn.textContent = o.addLabel;

  const note = document.createElement('p');
  note.className = 'adm-le__note';
  note.hidden = true;

  el.append(empty, rowsEl, addBtn, note);

  /** Zeilen in Anzeigereihenfolge -- die Wahrheit steht im DOM. */
  const rows = new Map<HTMLElement, ListRow<T>>();

  function change(): void {
    refresh();
    o.onChange?.();
  }

  function refresh(): void {
    const count = rowsEl.children.length;
    empty.hidden = count > 0;
    if (o.max) {
      const full = count >= o.max;
      addBtn.disabled = full;
      note.hidden = !full;
      if (full) note.textContent = `Llegaste al máximo de ${o.max}.`;
    }
  }

  function buildRow(item: T): ListRow<T> {
    const row = o.renderRow(item, { onInput: () => o.onChange?.() });
    row.el.classList.add('adm-le__row');

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'adm-le__handle';
    handle.dataset.dragHandle = '';
    handle.setAttribute('aria-label', 'Mover. Usá las flechas arriba y abajo.');
    handle.innerHTML = '<span aria-hidden="true">⠿</span>';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'adm-le__remove';
    remove.setAttribute('aria-label', 'Quitar');
    remove.innerHTML = '<span aria-hidden="true">✕</span>';
    remove.addEventListener('click', () => removeRow(row));

    row.el.prepend(handle);
    row.el.append(remove);
    rows.set(row.el, row);
    return row;
  }

  function addRow(item: T, opts: { focus?: boolean; at?: number } = {}): ListRow<T> {
    const row = buildRow(item);
    const at = opts.at;
    if (at !== undefined && at < rowsEl.children.length) {
      rowsEl.insertBefore(row.el, rowsEl.children[at]);
    } else {
      rowsEl.append(row.el);
    }
    if (opts.focus) row.focus();
    return row;
  }

  /** Entfernen ist zurücknehmbar -- an derselben Stelle, mit demselben Inhalt. */
  function removeRow(row: ListRow<T>): void {
    const index = Array.from(rowsEl.children).indexOf(row.el);
    const value = row.read();
    row.el.remove();
    rows.delete(row.el);
    change();

    toast(`Se quitó un ${noun}.`, {
      tone: 'info',
      undo: () => {
        addRow(value, { at: index });
        change();
      },
    });
  }

  addBtn.addEventListener('click', () => {
    addRow(o.createEmpty(), { focus: true });
    change();
  });

  /**
   * Die Reihenfolge lebt hier nur im Speicher -- gespeichert wird sie erst mit
   * dem umgebenden Formular. Deshalb interessiert der fraktionale Wert nicht,
   * es zählt allein die neue Position im DOM.
   */
  const sorter = sortable({
    list: rowsEl,
    onReorder: async () => {
      o.onChange?.();
    },
    getSortOrders: () => Array.from(rowsEl.children, (_, i) => i),
  });

  refresh();

  return {
    el,
    setItems(items) {
      rowsEl.replaceChildren();
      rows.clear();
      for (const item of items) addRow(item);
      refresh();
    },
    getItems() {
      return Array.from(rowsEl.children)
        .map((child) => rows.get(child as HTMLElement))
        .filter((r): r is ListRow<T> => Boolean(r))
        .map((r) => r.read());
    },
    destroy() {
      sorter.destroy();
    },
  };
}
