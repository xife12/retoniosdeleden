import {
  borrarSolicitud,
  getSolicitud,
  listSolicitudes,
  setEstado,
  type SolicitudEstado,
  type SolicitudRow,
} from './solicitudes-store';
import { confirmDialog } from './dialog';
import { humanError, isSessionCancelled } from './errors';
import { navigate, type Route } from './router';
import { toast } from './toast';
// list.css liefert .adm-list/.adm-card wörtlich -- anders als
// documents-view.ts (eigene .docs-*-Klassen) wird hier nichts umbenannt,
// weil die Liste genau dasselbe Kartenbild braucht wie Talleres/Casas/
// Módulos/On Tour, nur ohne Ziehgriff und Überlaufmenü.
import '../../styles/admin/list.css';
import '../../styles/admin/solicitudes.css';

/**
 * Anfragen ("Las abejas educan" und "On Tour"): Liste, Detailansicht,
 * Löschen. Schließt den offenen Punkt 1 aus der Übergabe-PR #6: das
 * Formular schreibt seit Migration 005 in `public.solicitudes`, aber der
 * Router kannte bislang keinen Bereich dafür -- Anfragen kamen an und
 * niemand konnte sie im Panel lesen.
 *
 * Montiert sich wie documents-view.ts über main.ts' `RoutedView`-Vertrag
 * (`mount(container, route)`), nicht über entity-list.ts: dessen
 * `EntityListOptions` verlangt Entwurf/Veröffentlicht und eine Sortierung,
 * beides kennt eine Anfrage nicht (siehe Dateikopf von solicitudes-store.ts).
 * Der Bearbeitungsstand hier ist `estado` (neu/beantwortet/confirmado/
 * cancelado), keine Veröffentlichung -- eine Anfrage steht nie "auf der
 * Website".
 *
 * ----------------------------------------------------------------------------
 * Warum die Modul-/Seminar-IDs roh angezeigt werden
 * ----------------------------------------------------------------------------
 * `solicitudes.modulos` speichert stabile IDs (Migration 005: bewusst KEIN
 * Fremdschlüssel, die Anfrage ist ein Dokument über einen Zeitpunkt). Sie
 * gegen die aktuellen Módulos/Seminare aufzulösen, würde eine ältere Anfrage
 * so aussehen lassen, als bezöge sie sich auf den heutigen Stand -- genau
 * das, was die Migration verhindern wollte. Die Kennungen sind für die
 * Person, die eine Anfrage beantwortet, ohnehin sprechend genug
 * ('colmena-viva', 'aromas').
 */

let teardown: (() => void) | null = null;

export async function mount(container: HTMLElement, route: Route): Promise<void> {
  if (route.view === 'solicitud') {
    await mountDetail(container, route.id);
    return;
  }
  await mountList(container);
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

/** Wie in documents-view.ts: fail() aus dem Store übersetzt bereits, ein
 *  zweiter humanError()-Durchlauf würde nur den Fallback-Satz erzeugen. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return humanError(err).message;
}

const ESTADO_LABEL: Record<SolicitudEstado, string> = {
  neu: 'Nueva',
  beantwortet: 'Respondida',
  confirmado: 'Confirmada',
  cancelado: 'Cancelada',
};

const ESTADO_ORDER: SolicitudEstado[] = ['neu', 'beantwortet', 'confirmado', 'cancelado'];

const ORIGEN_LABEL: Record<SolicitudRow['origen'], string> = {
  escuelas: 'Las abejas educan',
  on_tour: 'On Tour',
};

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  // "yyyy-mm-dd" aus <input type="date"> als Datum ohne Zeitzonensprung lesen
  // -- new Date('2026-09-18') würde sonst auf UTC-Mitternacht landen und je
  // nach Zeitzone der Betrachterin einen Tag zu früh anzeigen.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-UY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Wer/was die Anfrage betrifft, in einer Zeile -- Schule oder Organisation. */
function tituloDe(row: SolicitudRow): string {
  return row.origen === 'escuelas' ? row.escuela || 'Sin nombre' : row.organizacion || 'Sin nombre';
}

/** Anzahl Kinder/Personen, unabhängig von der Herkunft. */
function cantidadDe(row: SolicitudRow): string {
  const n = row.origen === 'escuelas' ? row.alumnos : row.personas;
  return n ? `${n} ${row.origen === 'escuelas' ? 'alumnos' : 'personas'}` : '—';
}

/* ===========================================================================
   Liste
   =========================================================================== */

type Filtro = 'todas' | SolicitudEstado;

async function mountList(container: HTMLElement): Promise<void> {
  const root = el('div', 'adm-list sol-list');

  const head = el('header', 'adm-list__head');
  head.append(el('h1', 'adm-list__title', 'Solicitudes'));
  root.append(head);

  const tools = el('div', 'adm-list__tools');
  const chips = el('div', 'adm-list__filters');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Filtrar por estado');

  const chipDefs: { value: Filtro; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'neu', label: ESTADO_LABEL.neu },
    { value: 'beantwortet', label: ESTADO_LABEL.beantwortet },
    { value: 'confirmado', label: ESTADO_LABEL.confirmado },
    { value: 'cancelado', label: ESTADO_LABEL.cancelado },
  ];
  let filtro: Filtro = 'todas';
  let rows: SolicitudRow[] = [];

  const chipButtons = chipDefs.map((def) => {
    const b = el('button', 'adm-list__filter', def.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      filtro = def.value;
      for (const [i, other] of chipButtons.entries()) {
        const on = chipDefs[i].value === filtro;
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

  tools.append(chips);
  root.append(tools);

  const listEl = el('ul', 'adm-list__items');
  const emptyEl = el('p', 'adm-list__empty', 'Todavía no llegó ninguna solicitud.');
  root.append(listEl, emptyEl);

  function chipLabel(def: { value: Filtro; label: string }): string {
    if (def.value === 'todas') return `${def.label} (${rows.length})`;
    const n = rows.filter((r) => r.estado === def.value).length;
    return `${def.label} (${n})`;
  }

  function refreshChipLabels(): void {
    for (const [i, btn] of chipButtons.entries()) {
      btn.textContent = chipLabel(chipDefs[i]);
    }
  }

  function buildRow(row: SolicitudRow): HTMLElement {
    const li = el('li', 'adm-card sol-card');

    const open = el('button', 'adm-card__open');
    open.type = 'button';
    open.addEventListener('click', () => navigate({ view: 'solicitud', id: row.id }));

    const body = el('span', 'adm-card__body');
    const titleRow = el('span', 'adm-card__titlerow');
    titleRow.append(el('span', 'adm-card__title', tituloDe(row)));
    titleRow.append(el('span', `adm-badge sol-badge--${row.estado}`, ESTADO_LABEL[row.estado]));
    titleRow.append(el('span', 'sol-origen', ORIGEN_LABEL[row.origen]));
    body.append(titleRow);

    const meta = [
      row.docente,
      `Fecha pedida: ${formatFecha(row.fecha_1)}`,
      cantidadDe(row),
      `Llegó el ${formatFechaHora(row.creado_en)}`,
    ];
    body.append(el('span', 'adm-card__meta', meta.join(' · ')));

    open.append(body);
    li.append(open);
    return li;
  }

  function render(): void {
    const items = filtro === 'todas' ? rows : rows.filter((r) => r.estado === filtro);
    listEl.replaceChildren(...items.map(buildRow));
    emptyEl.hidden = items.length > 0;
    emptyEl.textContent =
      filtro === 'todas' ? 'Todavía no llegó ninguna solicitud.' : 'No hay solicitudes en este estado.';
    refreshChipLabels();
  }

  async function reload(): Promise<void> {
    try {
      rows = await listSolicitudes();
      render();
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = errorMessage(err);
    }
  }

  container.append(root);
  teardown = () => root.remove();
  await reload();
}

/* ===========================================================================
   Detalle
   =========================================================================== */

async function mountDetail(container: HTMLElement, id: string): Promise<void> {
  const root = el('div', 'sol-detail');
  container.append(root);
  teardown = () => root.remove();

  const row = await getSolicitud(id);
  if (!row) {
    toast('Esa solicitud ya no existe.', { tone: 'error' });
    navigate({ view: 'solicitudes' }, { replace: true });
    return;
  }

  const back = el('button', 'sol-detail__back', '← Solicitudes');
  back.type = 'button';
  back.addEventListener('click', () => navigate({ view: 'solicitudes' }));
  root.append(back);

  const head = el('div', 'sol-detail__head');
  head.append(el('h1', 'sol-detail__title', tituloDe(row)));
  head.append(el('p', 'sol-detail__sub', `${ORIGEN_LABEL[row.origen]} · Llegó el ${formatFechaHora(row.creado_en)}`));
  root.append(head);

  /* ---------------- Estado ---------------- */

  const estadoField = el('div', 'adm-field sol-detail__estado');
  const estadoLabel = el('label', 'adm-label', 'Estado');
  estadoLabel.htmlFor = 'sol-estado';
  const estadoSelect = el('select', 'adm-input');
  estadoSelect.id = 'sol-estado';
  for (const value of ESTADO_ORDER) {
    const opt = el('option', undefined, ESTADO_LABEL[value]);
    opt.value = value;
    if (value === row.estado) opt.selected = true;
    estadoSelect.append(opt);
  }
  estadoSelect.addEventListener('change', () => {
    const next = estadoSelect.value as SolicitudEstado;
    const previous = row.estado;
    void (async () => {
      try {
        await setEstado(row.id, next);
        row.estado = next;
        toast(`Marcada como “${ESTADO_LABEL[next]}”.`, { tone: 'ok' });
      } catch (err) {
        estadoSelect.value = previous;
        if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      }
    })();
  });
  estadoField.append(estadoLabel, estadoSelect);
  root.append(estadoField);

  /* ---------------- Secciones de datos ---------------- */

  function section(title: string): HTMLElement {
    const s = el('section', 'sol-detail__section');
    s.append(el('h2', 'sol-detail__sectiontitle', title));
    root.append(s);
    return s;
  }

  function row2(label: string, value: string): HTMLElement {
    const r = el('div', 'sol-detail__row');
    r.append(el('span', 'sol-detail__rowlabel', label), el('span', 'sol-detail__rowvalue', value));
    return r;
  }

  const contacto = section('Contacto');
  contacto.append(
    row2('Nombre', row.docente),
    row2('Correo', row.mail),
    row2('Teléfono', row.telefono || '—'),
  );

  const datos = section(row.origen === 'escuelas' ? 'Datos de la escuela' : 'Datos de la salida');
  if (row.origen === 'escuelas') {
    datos.append(
      row2('Escuela', row.escuela || '—'),
      row2('Clase', row.clase || '—'),
      row2('Alumnos', row.alumnos != null ? String(row.alumnos) : '—'),
    );
  } else {
    datos.append(
      row2('Organización', row.organizacion || '—'),
      row2('Personas', row.personas != null ? String(row.personas) : '—'),
      row2('Zona', row.zona || '—'),
      row2('Lugar', row.lugar || '—'),
    );
  }

  const fechas = section('Fechas pedidas');
  fechas.append(row2('Primera opción', formatFecha(row.fecha_1)), row2('Segunda opción', formatFecha(row.fecha_2)));

  const modulos = section(row.origen === 'escuelas' ? 'Módulos elegidos' : 'Seminarios elegidos');
  modulos.append(el('p', 'sol-detail__ids', row.modulos.length ? row.modulos.join(' · ') : 'Ninguno.'));

  if (row.nota) {
    const nota = section('Nota de la persona');
    nota.append(el('p', 'sol-detail__nota', row.nota));
  }

  const consent = section('Consentimiento (Ley 18.331)');
  consent.append(
    row2('Aceptado el', formatFechaHora(row.consentimiento_en)),
    el('p', 'sol-detail__consenttext', row.consentimiento_texto),
  );

  /* ---------------- Gefahrenzone ---------------- */

  const danger = el('div', 'sol-detail__danger');
  danger.append(el('h2', 'sol-detail__dangertitle', 'Eliminar'));
  danger.append(
    el(
      'p',
      'sol-detail__dangertext',
      'Borra la solicitud para siempre, sin papelera de reciclaje -- así lo pide la ley de protección de datos.',
    ),
  );
  const del = el('button', 'btn btn--ghost adm-btn--danger', 'Eliminar esta solicitud');
  del.type = 'button';
  del.addEventListener('click', () => {
    void (async () => {
      const ok = await confirmDialog({
        title: `¿Eliminar la solicitud de “${tituloDe(row)}”?`,
        body: 'Se borra para siempre de la base de datos. No se puede deshacer.',
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await borrarSolicitud(row.id);
        toast('Solicitud eliminada.', { tone: 'ok' });
        navigate({ view: 'solicitudes' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(errorMessage(err), { tone: 'error' });
      }
    })();
  });
  danger.append(del);
  root.append(danger);
}
