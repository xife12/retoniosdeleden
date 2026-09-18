import { abejasEducanUI } from '../../data/modulos';
import { confirmDialog } from './dialog';
import { createAutoSaver } from './dirty';
import { completeness, pairedField, type PairedField } from './fields';
import { listEditor } from './list-editor';
import { editorShell } from './editor-shell';
import { entityList, type ListCard } from './entity-list';
import { moduloPreview } from './preview';
import { navigate, setLeaveGuard } from './router';
import { createStore } from './store';
import { draftSlug, ensureUniqueSlug, isDraftSlug, slugify } from './slug';
import { toast } from './toast';
import { humanError, isSessionCancelled } from './errors';
import {
  draftFromModulo,
  emptyModuloDraft,
  moduloPatch,
  type Bilingual,
  type ModuloDraft,
  type ModuloRow,
} from './drafts';
import {
  checkChips,
  controlRow,
  numberField,
  selectField,
  textField,
  type Control,
} from './controls';

/**
 * Módulos ("Las abejas educan"): Liste und Editor.
 *
 * Der Bereich ist die Kopie des Musters von den Talleres -- Liste und Editor
 * sind Ansichten derselben Seite, gespeichert wird beim Tippen,
 * veröffentlicht nur auf ausdrücklichen Knopfdruck (Spec 2.1, Aufgabe D3 aus
 * PLAN-ANPASSUNGEN-01.md). Wer workshops-view.ts kennt, kennt auch diese
 * Datei; die Unterschiede stehen alle in der Sache und sind unten jeweils
 * dort kommentiert, wo sie auftauchen:
 *
 *  - `numero` ist nicht die Sortierung, sondern die sichtbare Nummer in der
 *    Wabe.
 *  - `meses` gehört zum einzelnen Modul, nicht zum Bereich -- Schuljahr und
 *    Bienensaison decken sich nicht.
 *  - `estado` ('disponible'/'proximamente') ist nicht der
 *    Veröffentlichungszustand: ein Modul auf 'proximamente' steht auf der
 *    Website, nur ohne Auswahlknopf.
 *
 * Datenquelle ist die Tabelle `modulos` aus supabase/migrations/006_modulos.sql.
 */

const store = createStore<ModuloRow>('modulos');

/** Beschriftungen, die die Nutzerin auch auf der Website sieht. */
const UI = abejasEducanUI.es;

const LUGAR_OPTIONS = [
  { value: 'aula', label: UI.enAula },
  { value: 'chacra', label: UI.enChacra },
];

const ESTADO_OPTIONS = [
  { value: 'disponible', label: 'Se puede pedir' },
  { value: 'proximamente', label: UI.proximamente },
];

/** Die zwölf Monate als Kästchen -- Beschriftung wie auf der Website. */
const MES_OPTIONS = UI.mesesCortos.map((label, i) => ({ value: String(i + 1), label }));

/** Wie die Wabe auf der Website: Sechseck mit der Nummer darin. */
function hexArt(numero: number): string {
  return (
    '<path d="M45 8 L76 26 L76 64 L45 82 L14 64 L14 26 Z" fill="var(--miel-100)" ' +
    'stroke="var(--miel-500)" stroke-width="3" stroke-linejoin="round"/>' +
    `<text x="45" y="58" text-anchor="middle" font-size="34" font-weight="700" ` +
    `fill="var(--miel-800)">${numero}</text>`
  );
}

/** Minuten menschlich: ganze Stunden werden als Stunden gelesen. */
function duracionTexto(minutos: number): string {
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} ${UI.horas}`;
  return `${minutos} ${UI.minutos}`;
}

function edadTexto(min: number, max: number | null): string {
  // Ohne Obergrenze steht auf der Website "desde 8", nicht "8 – 0".
  if (max === null || max <= 0 || max < min) return `desde ${min} años`;
  return `${min} a ${max} años`;
}

let teardown: (() => void) | null = null;

export function unmount(): void {
  teardown?.();
  teardown = null;
  setLeaveGuard(null);
}

/* ===========================================================================
   Liste
   =========================================================================== */

/** Wie viele der vier Pflichttexte je Sprache stehen. */
function filledCount(row: ModuloRow, lang: 'es' | 'en'): number {
  const t = row.translations?.[lang] ?? {};
  const keys = ['title', 'clase', 'summary', 'longDesc'] as const;
  return keys.filter((k) => typeof t[k] === 'string' && t[k]!.trim()).length;
}

/** Monatsleiste der Karte, z. B. „mar · abr · … · nov". */
function mesesTexto(meses: unknown): string {
  if (!Array.isArray(meses) || meses.length === 0) return 'Sin meses elegidos';
  return meses
    .filter((m): m is number => typeof m === 'number' && m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => UI.mesesCortos[m - 1])
    .join(' · ');
}

export async function mountList(container: HTMLElement): Promise<void> {
  const view = entityList<ModuloRow>({
    title: 'Módulos',
    newLabel: '+ Nuevo módulo',
    emptyText: 'Todavía no hay módulos. Creá el primero.',
    searchPlaceholder: 'Buscar módulo…',
    load: () => store.list(),
    onNew: () => navigate({ view: 'modulo', id: 'nuevo' }),
    onOpen: (row) => navigate({ view: 'modulo', id: row.id }),
    onReorder: (row, value) => store.setSortOrder(row.id, value),
    onArchive: async (row, archived) => {
      await store.setStatus(row.id, archived ? 'archived' : 'published');
    },
    onDelete: (row) => store.remove(row.id),
    nameOf: (row) => row.translations?.es?.title || 'Sin título',
    card: (row): ListCard => ({
      art: hexArt(Number(row.numero) || 0),
      title: row.translations?.es?.title || 'Sin título',
      meta: [
        row.lugar === 'chacra' ? UI.enChacra : UI.enAula,
        // 'proximamente' gehört auf die Karte: sonst sieht man einem
        // veröffentlichten Modul nicht an, dass es niemand buchen kann.
        row.estado === 'proximamente' ? UI.proximamente : 'Se puede pedir',
        `${edadTexto(Number(row.edad_min) || 0, row.edad_max)} · ${row.translations?.es?.clase ?? ''}`.trim(),
        `${duracionTexto(Number(row.duracion) || 0)} · ${row.max_alumnos} ${UI.alumnos}`,
        mesesTexto(row.meses),
      ],
      es: filledCount(row, 'es'),
      en: filledCount(row, 'en'),
      total: 4,
    }),
  });

  container.append(view.el);
  teardown = view.destroy;
  await view.reload();
}

/* ===========================================================================
   Editor
   =========================================================================== */

export async function mountEditor(container: HTMLElement, id: string): Promise<void> {
  const isNew = id === 'nuevo';

  let row: ModuloRow | null = null;
  let draft: ModuloDraft;

  if (isNew) {
    draft = emptyModuloDraft();
    draft.slug = draftSlug('modulo');
  } else {
    const all = await store.list();
    row = all.find((r) => r.id === id) ?? null;
    if (!row) {
      toast('Ese módulo ya no existe.', { tone: 'error' });
      navigate({ view: 'modulos' }, { replace: true });
      return;
    }
    draft = draftFromModulo(row);
  }

  const shell = editorShell({ backLabel: 'Módulos' });
  container.append(shell.root);

  const fields: PairedField[] = [];
  const controls: Control<unknown>[] = [];

  /** Sammelt alle Eingaben in den Entwurf zurück. */
  let collect: () => void = () => {};

  const preview = moduloPreview(() => {
    collect();
    return draft;
  });
  shell.setPreview(preview.el);

  const saver = createAutoSaver({
    save: () => persist(),
    onState: (state, at) => shell.setSaveState(state, at),
  });

  function touched(): void {
    collect();
    saver.markDirty();
    preview.update();
    refreshHeader();
  }

  /* ---------------- Abschnitt: Datos ---------------- */

  const dataSection = shell.addSection('datos', 'Datos');

  const numero = numberField({
    label: 'Número en la ruta',
    hint: 'Es el número que se ve dentro del panal. El orden de la lista se cambia arrastrando.',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });
  const lugar = selectField({
    label: 'Dónde se hace',
    options: LUGAR_OPTIONS,
    onChange: touched,
  });
  const estado = selectField({
    label: '¿Se puede pedir?',
    hint: '“Próximamente” muestra el módulo en la web, pero sin botón para elegirlo.',
    options: ESTADO_OPTIONS,
    onChange: touched,
  });
  const edadMin = numberField({
    label: 'Edad desde',
    min: 0,
    step: 1,
    integer: true,
    unit: 'años',
    onInput: touched,
  });
  const edadMax = numberField({
    label: 'Edad hasta',
    // 0 ist hier kein fehlender Wert, sondern eine Aussage: "nach oben
    // offen". Ein Zahlenfeld hat keinen leeren Zustand, auf den man sich
    // verlassen könnte -- deshalb die 0 mit einem Satz erklärt, statt sie
    // stillschweigend zu deuten.
    hint: 'Dejalo en 0 si no hay tope („desde 8 años").',
    min: 0,
    step: 1,
    integer: true,
    unit: 'años',
    onInput: touched,
  });
  const duracion = numberField({
    label: 'Duración',
    hint: 'En minutos: 60, 90, 180…',
    min: 5,
    step: 5,
    integer: true,
    unit: 'min',
    onInput: touched,
  });
  const maxAlumnos = numberField({
    label: 'Máximo de alumnos',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });

  controls.push(numero, lugar, estado, edadMin, edadMax, duracion, maxAlumnos);
  dataSection.append(
    controlRow(numero, lugar),
    controlRow(estado),
    controlRow(edadMin, edadMax),
    controlRow(duracion, maxAlumnos),
  );

  /* ---------------- Abschnitt: Meses ----------------

     Eigener Abschnitt, nicht eine Zeile bei „Datos": die Monate sind je
     Modul verschieden (das Schuljahr geht von März bis November, die
     Bienensaison auf der Chacra von Oktober bis April), und genau das ist
     die Angabe, die man beim Pflegen am leichtesten übersieht. */

  const mesesSection = shell.addSection('meses', 'En qué meses se ofrece');
  const meses = checkChips({
    label: 'Meses',
    hint: 'Los módulos en el aula siguen el año escolar; la visita a la chacra sigue la temporada de las abejas. Por eso se elige módulo por módulo.',
    options: MES_OPTIONS,
    toggleAllLabel: 'Todos los meses',
    onChange: touched,
  });
  mesesSection.append(meses.el);

  /* ---------------- Abschnitt: Textos ---------------- */

  const textSection = shell.addSection('textos', 'Textos');

  function bilingual(
    label: string,
    value: Bilingual,
    o: {
      type?: 'text' | 'textarea';
      rows?: number;
      maxLength?: number;
      hint?: string;
      required?: boolean;
    } = {},
  ): PairedField {
    const field = pairedField({ label, onInput: touched, ...o });
    field.set(value);
    fields.push(field);
    textSection.append(field.el);
    return field;
  }

  const fTitle = bilingual('Título', draft.title, { required: true });
  const fClase = bilingual('Clase o año', draft.clase, {
    required: true,
    hint: 'Como se escribe en la escuela, p. ej. „3.° a 6.°".',
  });
  const fSummary = bilingual('Resumen corto', draft.summary, {
    type: 'textarea',
    rows: 3,
    maxLength: 200,
    required: true,
    hint: 'Es el texto que se ve en la tarjeta del panal.',
  });
  const fLongDesc = bilingual('Descripción completa', draft.longDesc, {
    type: 'textarea',
    rows: 5,
    required: true,
    hint: 'El texto largo detrás de „Leer más".',
  });

  /* ---------------- Abschnitt: Objetivos ---------------- */

  const objSection = shell.addSection('objetivos', UI.objetivos);
  const objetivos = listEditor<Bilingual>({
    addLabel: '+ Agregar objetivo',
    emptyText: 'Sin objetivos. El módulo se muestra igual, pero sin la lista de aprendizajes.',
    itemNoun: 'objetivo',
    // Drei sind auf der Karte noch lesbar, darüber wird es eine Wand aus
    // Text -- die Grenze steht deshalb hier und nicht erst in der Datenbank.
    max: 3,
    createEmpty: () => ({ es: '', en: '' }),
    onChange: touched,
    renderRow: (item, api) => {
      const field = pairedField({ label: '', onInput: api.onInput });
      field.set(item);
      const body = document.createElement('div');
      body.className = 'adm-le__body';
      body.append(field.el);
      return { el: body, read: () => field.get(), focus: () => field.focus() };
    },
  });
  objetivos.el.classList.add('adm-le--numbered');
  objSection.append(objetivos.el);

  /* ---------------- Abschnitt: Ajustes avanzados ---------------- */

  const advSection = shell.addSection('avanzado', 'Ajustes avanzados');
  const slugCtl = textField({
    label: 'Nombre interno (slug)',
    // Anders als bei den Talleres ist das keine eigene Unterseite: der Slug
    // ist der Wert, den das Anfrageformular mitschickt. Er darf sich ändern,
    // nur laufen dann alte Anfragen ins Leere.
    hint: 'Es el valor que viaja en el formulario de solicitud. Cambialo sólo si sabés por qué.',
    onInput: touched,
  });
  controls.push(slugCtl);
  advSection.append(slugCtl.el);

  /* ---------------- Gefahrenzone ---------------- */

  const danger = shell.dangerZone();
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--ghost adm-btn--danger';
  del.textContent = 'Eliminar este módulo';
  danger.append(del);

  del.addEventListener('click', () => {
    void (async () => {
      const name = draft.title.es || 'este módulo';
      const ok = await confirmDialog({
        title: `¿Eliminar “${name}”?`,
        body: 'Desaparece del panel y de la web, pero podés recuperarlo durante 30 días. Si sólo querés sacarlo de la web, archivalo.',
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok || !row) return;
      try {
        await store.remove(row.id);
        toast('Módulo eliminado.', { tone: 'ok' });
        setLeaveGuard(null);
        navigate({ view: 'modulos' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    })();
  });

  /* ---------------- Werte hinein und wieder heraus ---------------- */

  function fill(): void {
    numero.set(draft.numero);
    lugar.set(draft.lugar);
    estado.set(draft.estado);
    edadMin.set(draft.edadMin);
    edadMax.set(draft.edadMax);
    duracion.set(draft.duracion);
    maxAlumnos.set(draft.maxAlumnos);
    meses.set(draft.meses.map(String));
    slugCtl.set(draft.slug);
    objetivos.setItems(draft.objetivos);
  }

  collect = () => {
    draft.numero = numero.get();
    draft.lugar = lugar.get() as ModuloDraft['lugar'];
    draft.estado = estado.get() as ModuloDraft['estado'];
    draft.edadMin = edadMin.get();
    draft.edadMax = edadMax.get();
    draft.duracion = duracion.get();
    draft.maxAlumnos = maxAlumnos.get();
    // Die Kästchen liefern Strings; die Datenbank will Zahlen 1-12.
    draft.meses = meses
      .get()
      .map(Number)
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
      .sort((a, b) => a - b) as ModuloDraft['meses'];
    draft.slug = slugCtl.get();
    draft.title = fTitle.get();
    draft.clase = fClase.get();
    draft.summary = fSummary.get();
    draft.longDesc = fLongDesc.get();
    draft.objetivos = objetivos.getItems().filter((x) => x.es || x.en);
  };

  fill();

  /* ---------------- Kopfzeile aktuell halten ---------------- */

  function badge(): void {
    if (!row) {
      shell.setBadge('draft');
      return;
    }
    if (row.status === 'archived') shell.setBadge('archived');
    else if (row.status === 'draft') shell.setBadge('draft');
    else shell.setBadge(row.has_unpublished_changes ? 'published-dirty' : 'published');
  }

  function refreshHeader(): void {
    shell.setTitle(draft.title.es);
    const c = completeness(fields);
    shell.setCompleteness(c.es, c.en, () => c.firstMissing?.field.focus(c.firstMissing.lang));

    const textState =
      c.es.done === c.es.total && c.en.done === c.en.total
        ? 'ok'
        : c.es.done + c.en.done === 0
          ? 'empty'
          : 'partial';
    shell.setSectionState('textos', textState);
    shell.setSectionState('meses', draft.meses.length ? 'ok' : 'empty');
    shell.setSectionState('objetivos', draft.objetivos.length ? 'ok' : 'empty');
    // „Vollständig" heißt hier: die Angaben, ohne die die Karte falsche
    // Zahlen zeigen würde. edadMax darf 0 sein (offen nach oben).
    shell.setSectionState(
      'datos',
      draft.duracion > 0 && draft.maxAlumnos > 0 && draft.edadMin > 0 ? 'ok' : 'partial',
    );
    shell.setSectionState('avanzado', 'ok');
    badge();
  }

  /* ---------------- Speichern ---------------- */

  async function persist(): Promise<void> {
    collect();

    // Der Slug entsteht aus dem spanischen Titel, solange die Nutzerin ihn
    // nicht selbst angefasst hat. Die Kollisionsabfrage läuft nur dann.
    if (draft.title.es && (isDraftSlug(draft.slug) || !draft.slug)) {
      const base = slugify(draft.title.es);
      if (base) {
        draft.slug = await ensureUniqueSlug('modulos', base, row?.id ?? '');
        slugCtl.set(draft.slug);
      }
    }

    const patch = moduloPatch(draft);

    if (!row) {
      row = await store.create({ ...patch, status: 'draft' });
    } else {
      await store.update(row.id, patch);
      row.has_unpublished_changes = row.status === 'published';
    }
    badge();
  }

  shell.onSaveNow(async () => {
    try {
      await saver.flush();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onPublish(async () => {
    try {
      await saver.flush();
      if (!row) return;
      await store.publish(row.id);
      row.status = 'published';
      row.has_unpublished_changes = false;
      badge();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      throw err;
    }
  });

  shell.onDiscard(async () => {
    if (!row) return;
    const ok = await confirmDialog({
      title: '¿Descartar los cambios sin publicar?',
      body: 'El módulo vuelve a como está ahora en la web.',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await store.discardChanges(row.id);
      toast('Se descartaron los cambios.', { tone: 'ok' });
      navigate({ view: 'modulo', id: row.id }, { replace: true });
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onBack(() => navigate({ view: 'modulos' }));

  /**
   * Verlassen ist erlaubt, sobald alles geschrieben ist. Der Autosave läuft
   * ohnehin ständig -- gefragt wird nur, wenn ein Schreibvorgang offen ist
   * oder gescheitert war (Problem P3).
   */
  setLeaveGuard(async () => {
    if (saver.state() === 'clean') return true;
    try {
      await saver.flush();
      return true;
    } catch {
      return confirmDialog({
        title: 'No se pudo guardar',
        body: 'Si salís ahora, se pierden los últimos cambios.',
        confirmLabel: 'Salir igual',
        cancelLabel: 'Seguir editando',
        tone: 'danger',
      });
    }
  });

  refreshHeader();

  teardown = () => {
    saver.destroy();
    preview.destroy();
    objetivos.destroy();
    shell.destroy();
  };
}
