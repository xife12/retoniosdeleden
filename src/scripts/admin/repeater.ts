/**
 * Generischer Listen-Editor: eine Reihe von Feldern pro Eintrag, Zeilen
 * hinzufügen/entfernen/neu ordnen (Auf/Ab statt Drag&Drop, siehe Plan).
 * Wird für Termine, Programm-Schritte, Inklusivleistungen und Mitbringen
 * wiederverwendet.
 */
export interface RepeaterOptions<T> {
  container: HTMLElement;
  /** Baut eine neue Zeile aus einem Datenobjekt. */
  renderRow: (item: T, index: number) => HTMLElement;
  /** Leerer Eintrag für den "Hinzufügen"-Button. */
  createEmpty: () => T;
  addButtonLabel: string;
}

export class Repeater<T> {
  private container: HTMLElement;
  private renderRow: (item: T, index: number) => HTMLElement;
  private createEmpty: () => T;
  private list: HTMLElement;
  private addBtn: HTMLButtonElement;

  constructor(opts: RepeaterOptions<T>) {
    this.container = opts.container;
    this.renderRow = opts.renderRow;
    this.createEmpty = opts.createEmpty;

    this.list = document.createElement('div');
    this.list.className = 'rep-list';

    this.addBtn = document.createElement('button');
    this.addBtn.type = 'button';
    this.addBtn.className = 'btn btn--ghost rep-add';
    this.addBtn.textContent = opts.addButtonLabel;
    this.addBtn.addEventListener('click', () => this.addRow(this.createEmpty()));

    this.container.replaceChildren(this.list, this.addBtn);
  }

  private renumber() {
    Array.from(this.list.children).forEach((row, i) => {
      row.querySelectorAll<HTMLElement>('[data-rep-index]').forEach((el) => {
        el.textContent = String(i + 1);
      });
      const up = row.querySelector<HTMLButtonElement>('[data-rep-up]');
      const down = row.querySelector<HTMLButtonElement>('[data-rep-down]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === this.list.children.length - 1;
    });
  }

  private addRow(item: T) {
    const row = this.renderRow(item, this.list.children.length);
    row.classList.add('rep-row');

    const controls = document.createElement('div');
    controls.className = 'rep-controls';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'rep-move';
    up.dataset.repUp = '';
    up.setAttribute('aria-label', 'Nach oben');
    up.textContent = '↑';
    up.addEventListener('click', () => {
      const prev = row.previousElementSibling;
      if (prev) this.list.insertBefore(row, prev);
      this.renumber();
    });

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'rep-move';
    down.dataset.repDown = '';
    down.setAttribute('aria-label', 'Nach unten');
    down.textContent = '↓';
    down.addEventListener('click', () => {
      const next = row.nextElementSibling;
      if (next) this.list.insertBefore(next, row);
      this.renumber();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'rep-remove';
    remove.setAttribute('aria-label', 'Entfernen');
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      row.remove();
      this.renumber();
    });

    controls.append(up, down, remove);
    row.append(controls);
    this.list.append(row);
    this.renumber();
  }

  /** Vorhandene Zeilen ersetzen, z. B. beim Öffnen zum Bearbeiten. */
  setItems(items: T[]) {
    this.list.replaceChildren();
    for (const item of items) this.addRow(item);
  }

  /** Werte aller Zeilen einsammeln, in Anzeige-Reihenfolge. */
  getValues(readRow: (row: HTMLElement) => T): T[] {
    return Array.from(this.list.children).map((row) => readRow(row as HTMLElement));
  }
}
