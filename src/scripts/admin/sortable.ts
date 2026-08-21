/**
 * Umsortieren per Ziehen -- mit Maus, Finger und Tastatur.
 *
 * Ersetzt die Auf/Ab-Knöpfe des alten Backends (Problem P9). Dort kostete ein
 * Eintrag von unten nach oben fünf Klicks und zehn Anfragen, jede davon zwei
 * parallele UPDATEs, die halb fehlschlagen konnten.
 *
 * Hier wird die Reihenfolge **fraktional** gespeichert: Der verschobene
 * Eintrag bekommt den Mittelwert seiner neuen Nachbarn. Damit ändert sich
 * genau eine Zeile, ein UPDATE, kein Neuladen der Liste. `sort_order` ist
 * dafür in der Datenbank `numeric` (siehe supabase/schema.sql).
 *
 * Pointer-Events statt HTML5-Drag-and-drop, weil letzteres auf Touch-Geräten
 * nicht existiert -- die Nutzerin arbeitet oft am Handy.
 */

export interface SortableOptions {
  /** Behälter, dessen direkte Kinder die sortierbaren Zeilen sind. */
  list: HTMLElement;
  /** Woran gezogen wird. Vorgabe: ein Element mit `data-drag-handle`. */
  handleSelector?: string;
  /**
   * Wird nach dem Loslassen aufgerufen. `newSortOrder` ist der fertig
   * berechnete Wert für die verschobene Zeile.
   */
  onReorder: (fromIndex: number, toIndex: number, newSortOrder: number) => Promise<void>;
  /** Aktuelle sort_order-Werte, in Anzeigereihenfolge. */
  getSortOrders: () => number[];
  /** Ansage für Screenreader, z. B. `(1, 5) => "Posición 1 de 5"`. */
  announce?: (position: number, total: number) => string;
}

export interface SortableHandle {
  destroy(): void;
}

/** Abstand, den neue Ränder zur bisherigen Liste bekommen. */
const EDGE_GAP = 10;

/**
 * Neuer sort_order-Wert für eine Zeile, die an `toIndex` landet.
 *
 * `orders` sind die Werte der **übrigen** Zeilen in Anzeigereihenfolge, also
 * ohne die verschobene. Ganz oben und ganz unten wird um EDGE_GAP verschoben,
 * dazwischen der Mittelwert der beiden Nachbarn genommen.
 */
export function fractionalOrder(orders: number[], toIndex: number): number {
  if (orders.length === 0) return 0;
  if (toIndex <= 0) return orders[0] - EDGE_GAP;
  if (toIndex >= orders.length) return orders[orders.length - 1] + EDGE_GAP;
  return (orders[toIndex - 1] + orders[toIndex]) / 2;
}

function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
}

/** Berechnet den neuen Wert aus der vollständigen Liste plus Start/Ziel. */
function orderFor(all: number[], fromIndex: number, toIndex: number): number {
  const rest = all.slice();
  rest.splice(fromIndex, 1);
  return fractionalOrder(rest, toIndex);
}

export function sortable(o: SortableOptions): SortableHandle {
  const { list } = o;
  const handleSelector = o.handleSelector ?? '[data-drag-handle]';
  const announce = o.announce ?? ((pos, total) => `Posición ${pos} de ${total}`);

  /** Eigene Live-Region: Tastaturverschieben muss hörbar sein. */
  const live = document.createElement('span');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  list.after(live);

  let dragging: HTMLElement | null = null;
  let startIndex = -1;
  let pointerId: number | null = null;

  function say(row: HTMLElement): void {
    const rows = rowsOf(list);
    live.textContent = announce(rows.indexOf(row) + 1, rows.length);
  }

  async function commit(row: HTMLElement, fromIndex: number): Promise<void> {
    const toIndex = rowsOf(list).indexOf(row);
    if (toIndex < 0 || toIndex === fromIndex) return;
    const all = o.getSortOrders();
    await o.onReorder(fromIndex, toIndex, orderFor(all, fromIndex, toIndex));
  }

  /* ---------------- Ziehen ---------------- */

  function onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement | null;
    const handle = target?.closest<HTMLElement>(handleSelector);
    if (!handle || !list.contains(handle)) return;

    const row = handle.closest<HTMLElement>(':scope > *') ?? null;
    const owner = rowsOf(list).find((r) => r === row || r.contains(handle));
    if (!owner) return;

    dragging = owner;
    startIndex = rowsOf(list).indexOf(owner);
    pointerId = e.pointerId;
    handle.setPointerCapture(e.pointerId);

    owner.classList.add('is-dragging');
    list.classList.add('is-sorting');
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging || e.pointerId !== pointerId) return;

    // Die Zeile unter dem Finger suchen und davor bzw. dahinter einhängen.
    const rows = rowsOf(list).filter((r) => r !== dragging);
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      if (e.clientY < box.top || e.clientY > box.bottom) continue;
      const before = e.clientY < box.top + box.height / 2;
      list.insertBefore(dragging, before ? row : row.nextSibling);
      break;
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging || e.pointerId !== pointerId) return;
    const row = dragging;
    const from = startIndex;

    row.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    dragging = null;
    pointerId = null;

    say(row);
    void commit(row, from);
  }

  /* ---------------- Tastatur ---------------- */

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const target = e.target as HTMLElement | null;
    const handle = target?.closest<HTMLElement>(handleSelector);
    if (!handle || !list.contains(handle)) return;

    const rows = rowsOf(list);
    const row = rows.find((r) => r.contains(handle));
    if (!row) return;

    const from = rows.indexOf(row);
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (to < 0 || to >= rows.length) return;

    e.preventDefault();
    if (e.key === 'ArrowUp') list.insertBefore(row, rows[to]);
    else list.insertBefore(rows[to], row);

    handle.focus();
    say(row);
    void commit(row, from);
  }

  list.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  list.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      list.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      list.removeEventListener('keydown', onKeyDown);
      live.remove();
    },
  };
}
