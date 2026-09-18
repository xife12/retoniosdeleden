import { onTourUI } from '../../data/on-tour';
import { formatPrice } from '../../data/workshops';
import { confirmDialog } from './dialog';
import { createAutoSaver } from './dirty';
import { completeness, pairedField, type PairedField } from './fields';
import { listEditor } from './list-editor';
import { editorShell } from './editor-shell';
import { entityList, type ListCard } from './entity-list';
import { seminarioPreview, zonaPreview } from './preview';
import { navigate, setLeaveGuard, type Route } from './router';
import { createStore } from './store';
import { draftSlug, ensureUniqueSlug, isDraftSlug, slugify } from './slug';
import { toast } from './toast';
import { humanError, isSessionCancelled } from './errors';
import {
  draftFromSeminario,
  draftFromZona,
  emptySeminarioDraft,
  emptyZonaDraft,
  seminarioPatch,
  zonaPatch,
  type Bilingual,
  type SeminarioDraft,
  type SeminarioRow,
  type ZonaDraft,
  type ZonaRow,
} from './drafts';
import {
  controlRow,
  numberField,
  radioCards,
  selectField,
  switchRow,
  textField,
} from './controls';

/**
 * "On Tour": Seminare und Anfahrtszonen -- Listen und Editoren.
 *
 * Der Bereich folgt dem Muster von workshops-view.ts und modulos-view.ts:
 * Liste und Editor sind Ansichten derselben Seite, gespeichert wird beim
 * Tippen, veröffentlicht nur auf ausdrücklichen Knopfdruck. Wer eine der
 * beiden Dateien kennt, kennt auch diese.
 *
 * ---------------------------------------------------------------------------
 * Warum die Zonen HIER stehen und nicht in einem eigenen Bereich
 * ---------------------------------------------------------------------------
 * In der Datenbank sind es zwei Tabellen (siehe 008_on_tour.sql), im Panel
 * ist es EIN Bereich mit einem Knopf in der Kopfzeile. Drei Gründe:
 *
 *  1. Sie beantworten dieselbe Frage. Was ein Termin kostet, ist Seminarpreis
 *     PLUS Anfahrt. Wer den einen Wert ändert, schaut fast immer auch auf den
 *     anderen. Zwei Knöpfe nebeneinander in der Kopfzeile, zwischen denen man
 *     bei jeder Preisfrage hin- und herspringt, wären die schlechtere Antwort
 *     auf denselben Vorgang.
 *  2. Es sind drei, und sie ändern sich selten. Ein eigener Bereich mit
 *     Suchfeld, Filterleiste und Ziehgriffen für drei Zeilen, die einmal im
 *     Jahr angefasst werden, sähe nach mehr Arbeit aus, als es ist. Die Zonen
 *     stehen deshalb als kurze Liste UNTER den Seminaren -- sichtbar, ohne
 *     sich vorzudrängen.
 *  3. Trotzdem hat jede Zone ihre eigene Adresse (#/on-tour/zona/<id>) und
 *     ihren eigenen Editor. Sie ist ein Datensatz mit eigenem
 *     Veröffentlichungszustand: eine Preisänderung soll erst dann live gehen,
 *     wenn die Zahl steht. Ein Aufklappfeld direkt in der Liste hätte keinen
 *     Platz für "Publicar", "Descartar cambios" und die Zustandsanzeige --
 *     und ohne eigene Adresse gäbe es auch keinen Zurück-Knopf.
 *
 * Weil dieser Bereich damit drei Ansichten hat statt der üblichen zwei,
 * meldet er sich in main.ts über `mount(container, route)` an (wie die
 * Dokumentenablage) statt über mountList/mountEditor.
 */

const seminarioStore = createStore<SeminarioRow>('on_tour_seminarios');
const zonaStore = createStore<ZonaRow>('on_tour_zonas');

/** Beschriftungen, die die Nutzerin auch auf der Website sieht. */
const UI = onTourUI.es;

/**
 * Die drei Pigmente aus tokens.css. Die Farbe steht im Namen dabei, weil
 * "lavanda" für sich genommen noch nicht sagt, was man auf der Karte sieht.
 */
const PIGMENTO_OPTIONS = [
  { value: 'miel', label: 'Miel (amarillo)' },
  { value: 'barro', label: 'Barro (tierra)' },
  { value: 'lavanda', label: 'Lavanda (violeta)' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'US$ — dólares' },
  { value: 'UYU', label: '$U — pesos' },
  { value: 'EUR', label: '€ — euros' },
  { value: 'ARS', label: 'AR$ — pesos argentinos' },
];

/**
 * Die Preisart als zwei große Karten, nicht als Auswahlliste.
 *
 * Eine Auswahlliste zeigt immer nur den gewählten Wert und sieht auch dann
 * beantwortet aus, wenn niemand sie angefasst hat. Hier stehen beide
 * Lesarten gleichzeitig auf dem Schirm, mit ausgeschriebener Folge -- das ist
 * die Angabe, deren Verwechslung den Preis um die Gruppengröße verfehlt.
 */
const PRECIO_TIPO_OPTIONS = [
  { value: 'porPersona', label: 'Por persona — se multiplica por la cantidad de gente' },
  { value: 'total', label: 'Por el grupo entero — es el mismo precio venga quien venga' },
];

/**
 * Zone: fester Aufschlag oder von Hand gerechnet.
 *
 * Derselbe Gedanke wie bei der Preisart, und hier noch wichtiger: "Incluido"
 * (Aufschlag 0) und "A calcular" (Aufschlag steht noch nicht fest) sind zwei
 * verschiedene Dinge, und nur eines davon ist ein Versprechen. Deshalb zwei
 * Karten mit ausgeschriebener Folge und kein Kästchen, das man übersieht.
 */
const ZONA_TIPO_OPTIONS = [
  { value: 'fijo', label: 'Recargo fijo — se suma este monto una vez (0 = incluido)' },
  { value: 'pedido', label: 'A calcular — el monto se dice a mano en la propuesta' },
];

/** Minuten menschlich: ganze Stunden werden als Stunden gelesen. */
function duracionTexto(minutos: number): string {
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} ${UI.horas}`;
  return `${minutos} ${UI.minutos}`;
}

/** Genau die Zeile, die auf der Karte steht -- Betrag UND Lesart. */
function precioTexto(row: SeminarioRow): string {
  const sufijo = row.precio_tipo === 'total' ? UI.precioTotal : UI.porPersona;
  return `${formatPrice(Number(row.precio) || 0, row.currency ?? 'USD')} ${sufijo}`;
}

/** Die drei Zustände einer Zone in einem kurzen Satz. */
function recargoTexto(row: ZonaRow): string {
  if (row.a_pedido || row.recargo === null || row.recargo === undefined) return UI.zonaAPedido;
  const value = Number(row.recargo) || 0;
  return value <= 0 ? UI.zonaSinRecargo : formatPrice(value, row.currency ?? 'UYU');
}

/** Kleines Wappen für die Liste: die Nummer in einem runden Fleck. */
function numeroArt(numero: number): string {
  return (
    '<circle cx="45" cy="45" r="34" fill="var(--miel-100)" ' +
    'stroke="var(--miel-500)" stroke-width="3"/>' +
    `<text x="45" y="58" text-anchor="middle" font-size="34" font-weight="700" ` +
    `fill="var(--miel-800)">${numero}</text>`
  );
}

let teardown: (() => void) | null = null;

export function unmount(): void {
  teardown?.();
  teardown = null;
  setLeaveGuard(null);
}

/**
 * Einstieg des Bereichs. Anders als Talleres/Casas/Módulos entscheidet hier
 * die Ansicht selbst, was sie zeigt -- siehe Kopfkommentar.
 */
export async function mount(container: HTMLElement, route: Route): Promise<void> {
  if (route.view === 'seminario') return mountSeminarioEditor(container, route.id);
  if (route.view === 'zona') return mountZonaEditor(container, route.id);
  return mountList(container);
}

/* ===========================================================================
   Liste: Seminare oben, Zonen darunter
   =========================================================================== */

/** Wie viele der vier Pflichttexte je Sprache stehen. */
function filledCount(row: SeminarioRow, lang: 'es' | 'en'): number {
  const t = row.translations?.[lang] ?? {};
  const keys = ['title', 'summary', 'longDesc', 'necesitamos'] as const;
  return keys.filter((k) => typeof t[k] === 'string' && t[k]!.trim()).length;
}

const ZONA_BADGE: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

/**
 * Die Zonenliste. Bewusst ohne Suchfeld, Filterleiste und Ziehgriffe: es sind
 * drei Zeilen. Die Reihenfolge steuert das Feld "Orden" im Zoneneditor --
 * sie ist hier Inhalt (Ringe von der Chacra nach außen) und nicht eine
 * Anzeigelaune, die man im Panel verschiebt.
 */
function zonasBlock(): { el: HTMLElement; reload: () => Promise<void> } {
  const root = document.createElement('section');
  root.className = 'adm-list adm-zonas';

  const head = document.createElement('header');
  head.className = 'adm-list__head';
  const h = document.createElement('h2');
  h.className = 'adm-list__title';
  h.textContent = UI.zonasTitulo;
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn btn--ghost adm-list__new';
  newBtn.textContent = '+ Nueva zona';
  newBtn.addEventListener('click', () => navigate({ view: 'zona', id: 'nueva' }));
  head.append(h, newBtn);

  const intro = document.createElement('p');
  intro.className = 'adm-list__empty';
  intro.textContent = UI.zonasIntro;

  const items = document.createElement('div');
  items.className = 'adm-list__items';

  root.append(head, intro, items);

  async function reload(): Promise<void> {
    let rows: ZonaRow[] = [];
    try {
      rows = await zonaStore.list();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      return;
    }

    // Nach `orden` und nicht nach sort_order: das ist die Angabe, die auch
    // auf der Website die Reihenfolge macht (siehe fetch-on-tour.ts). Stünde
    // hier eine andere Sortierung, führe die Nutzerin die Liste um, ohne dass
    // sich auf der Seite etwas bewegt.
    rows.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

    items.replaceChildren();

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'adm-list__empty';
      empty.textContent = 'Todavía no hay zonas de traslado. Creá la primera.';
      items.append(empty);
      return;
    }

    for (const row of rows) {
      const card = document.createElement('article');
      card.className = 'adm-card';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'adm-card__open';
      open.addEventListener('click', () => navigate({ view: 'zona', id: row.id }));

      const body = document.createElement('div');
      body.className = 'adm-card__body';

      const titleRow = document.createElement('div');
      titleRow.className = 'adm-card__titlerow';
      const title = document.createElement('span');
      title.className = 'adm-card__title';
      title.textContent = row.translations?.es?.nombre || 'Sin nombre';
      const badge = document.createElement('span');
      const dirty = row.status === 'published' && row.has_unpublished_changes;
      badge.className = `adm-badge adm-badge--${dirty ? 'published-dirty' : row.status}`;
      badge.textContent = dirty
        ? 'Publicado · cambios sin publicar'
        : (ZONA_BADGE[row.status] ?? row.status);
      titleRow.append(title, badge);

      const meta = document.createElement('span');
      meta.className = 'adm-card__meta';
      meta.textContent = `${recargoTexto(row)} · ${row.translations?.es?.detalle || 'Sin localidades'}`;

      body.append(titleRow, meta);
      open.append(body);
      card.append(open);
      items.append(card);
    }
  }

  return { el: root, reload };
}

export async function mountList(container: HTMLElement): Promise<void> {
  const view = entityList<SeminarioRow>({
    title: 'On Tour',
    newLabel: '+ Nuevo seminario',
    emptyText: 'Todavía no hay seminarios. Creá el primero.',
    searchPlaceholder: 'Buscar seminario…',
    load: () => seminarioStore.list(),
    onNew: () => navigate({ view: 'seminario', id: 'nuevo' }),
    onOpen: (row) => navigate({ view: 'seminario', id: row.id }),
    onReorder: (row, value) => seminarioStore.setSortOrder(row.id, value),
    onArchive: async (row, archived) => {
      await seminarioStore.setStatus(row.id, archived ? 'archived' : 'published');
    },
    onDelete: (row) => seminarioStore.remove(row.id),
    nameOf: (row) => row.translations?.es?.title || 'Sin título',
    card: (row): ListCard => ({
      art: numeroArt(Number(row.numero) || 0),
      title: row.translations?.es?.title || 'Sin título',
      meta: [
        // Der Preis steht zuerst und IMMER mit seiner Lesart: das ist die
        // Angabe, die man in einer Liste vergleicht, und ohne den Zusatz
        // stünden hier drei Beträge nebeneinander, die Verschiedenes meinen.
        precioTexto(row),
        `${duracionTexto(Number(row.duracion) || 0)} · ${UI.desde} ${row.min_personas} ${UI.hasta} ${row.max_personas} ${UI.personas}`,
        row.activo ? 'Se puede elegir' : 'Desactivado — se ve, pero no se puede elegir',
      ],
      es: filledCount(row, 'es'),
      en: filledCount(row, 'en'),
      total: 4,
    }),
  });

  const zonas = zonasBlock();

  const root = document.createElement('div');
  root.append(view.el, zonas.el);
  container.append(root);

  teardown = () => {
    view.destroy();
    root.remove();
  };

  await view.reload();
  await zonas.reload();
}

/* ===========================================================================
   Editor: Seminar
   =========================================================================== */

export async function mountSeminarioEditor(
  container: HTMLElement,
  id: string,
): Promise<void> {
  const isNew = id === 'nuevo';

  let row: SeminarioRow | null = null;
  let draft: SeminarioDraft;

  if (isNew) {
    draft = emptySeminarioDraft();
    draft.slug = draftSlug('seminario');
  } else {
    const all = await seminarioStore.list();
    row = all.find((r) => r.id === id) ?? null;
    if (!row) {
      toast('Ese seminario ya no existe.', { tone: 'error' });
      navigate({ view: 'onTour' }, { replace: true });
      return;
    }
    draft = draftFromSeminario(row);
  }

  const shell = editorShell({ backLabel: 'On Tour' });
  container.append(shell.root);

  const fields: PairedField[] = [];

  /** Sammelt alle Eingaben in den Entwurf zurück. */
  let collect: () => void = () => {};

  const preview = seminarioPreview(() => {
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

  /* ---------------- Abschnitt: Precio ----------------

     Ein eigener Abschnitt, ganz oben, und nicht eine Zeile bei "Datos": der
     Betrag allein ist zweideutig, und die Karte daneben ist die einzige
     Stelle, an der die Lesart unübersehbar wird. */

  const precioSection = shell.addSection('precio', 'Precio');

  const precio = numberField({
    label: 'Monto',
    min: 0,
    step: 1,
    onInput: touched,
  });
  const currency = selectField({
    label: 'Moneda',
    options: CURRENCY_OPTIONS,
    onChange: touched,
  });
  const precioTipo = radioCards({
    label: '¿Cómo se lee ese monto?',
    options: PRECIO_TIPO_OPTIONS,
    onChange: touched,
  });

  const precioNota = document.createElement('p');
  precioNota.className = 'adm-ctl__hint';
  precioNota.textContent =
    'Elegí siempre las dos cosas juntas. “US$ 40” quiere decir una cosa por persona y otra muy distinta por el grupo: con veinte personas, la diferencia es de veinte veces.';

  precioSection.append(controlRow(precio, currency), precioTipo.el, precioNota);

  /* ---------------- Abschnitt: Datos ---------------- */

  const dataSection = shell.addSection('datos', 'Datos');

  const numero = numberField({
    label: 'Número en la lista',
    hint: 'Es el número que se ve en la tarjeta. El orden de la lista se cambia arrastrando.',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });
  const pigmento = selectField({
    label: 'Color de la tarjeta',
    hint: 'Ata el seminario a su tema: miel para las abejas, barro para la tierra, lavanda para los aromas.',
    options: PIGMENTO_OPTIONS,
    onChange: touched,
  });
  const duracion = numberField({
    label: 'Duración',
    hint: 'En minutos: 120, 150, 180…',
    min: 5,
    step: 5,
    integer: true,
    unit: 'min',
    onInput: touched,
  });
  const minPersonas = numberField({
    label: 'Mínimo de personas',
    hint: 'Por debajo de este número no sale el viaje.',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });
  const maxPersonas = numberField({
    label: 'Máximo de personas',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });
  const activo = switchRow({
    label: 'Se puede elegir',
    // Nicht dasselbe wie "Publicar": ein abgeschaltetes Seminar steht
    // weiterhin auf der Website, nur ohne Knopf. Ein Entwurf steht gar
    // nicht dort. Zwei Fragen, zwei Schalter.
    hint: 'Si lo apagás, el seminario se sigue viendo en la web pero sin botón para elegirlo. Para sacarlo del todo, archivalo desde la lista.',
    onChange: touched,
  });

  dataSection.append(
    controlRow(numero, pigmento),
    controlRow(duracion),
    controlRow(minPersonas, maxPersonas),
    activo.el,
  );

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
  const fSummary = bilingual('Resumen corto', draft.summary, {
    type: 'textarea',
    rows: 3,
    maxLength: 220,
    required: true,
    hint: 'Es el texto que se ve en la tarjeta.',
  });
  const fLongDesc = bilingual('Descripción completa', draft.longDesc, {
    type: 'textarea',
    rows: 6,
    required: true,
    hint: 'El texto largo detrás de “Leer más”.',
  });
  const fNecesitamos = bilingual('Qué necesitamos del lugar', draft.necesitamos, {
    type: 'textarea',
    rows: 2,
    required: true,
    // Steht bewusst unter den Pflichttexten: es ist die Angabe, die die
    // häufigste Rückfrage vermeidet ("brauchen wir Strom? Wasser?").
    hint: 'Mesa, sombra, enchufe, canilla… Es la pregunta que más se repite.',
  });

  /* ---------------- Abschnitt: Qué llevamos ---------------- */

  const incluyeSection = shell.addSection('incluye', UI.incluye);
  const incluye = listEditor<Bilingual>({
    addLabel: '+ Agregar algo que llevamos',
    emptyText: 'Sin lista. El seminario se muestra igual, pero sin el detalle de lo que llevamos.',
    itemNoun: 'ítem',
    // Sechs sind auf einer Karte noch überschaubar; darüber liest es niemand
    // mehr. Die Grenze steht deshalb hier und nicht erst in der Datenbank.
    max: 6,
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
  incluyeSection.append(incluye.el);

  /* ---------------- Abschnitt: Ajustes avanzados ---------------- */

  const advSection = shell.addSection('avanzado', 'Ajustes avanzados');
  const slugCtl = textField({
    label: 'Nombre interno (slug)',
    hint: 'Es el valor que viaja en el formulario de solicitud. Cambialo sólo si sabés por qué.',
    onInput: touched,
  });
  advSection.append(slugCtl.el);

  /* ---------------- Gefahrenzone ---------------- */

  const danger = shell.dangerZone();
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--ghost adm-btn--danger';
  del.textContent = 'Eliminar este seminario';
  danger.append(del);

  del.addEventListener('click', () => {
    void (async () => {
      const name = draft.title.es || 'este seminario';
      const ok = await confirmDialog({
        title: `¿Eliminar “${name}”?`,
        body: 'Desaparece del panel y de la web, pero podés recuperarlo durante 30 días. Si sólo querés sacarlo de la web, archivalo.',
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok || !row) return;
      try {
        await seminarioStore.remove(row.id);
        toast('Seminario eliminado.', { tone: 'ok' });
        setLeaveGuard(null);
        navigate({ view: 'onTour' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    })();
  });

  /* ---------------- Werte hinein und wieder heraus ---------------- */

  function fill(): void {
    precio.set(draft.precio);
    currency.set(draft.currency);
    precioTipo.set(draft.precioTipo);
    numero.set(draft.numero);
    pigmento.set(draft.pigmento);
    duracion.set(draft.duracion);
    minPersonas.set(draft.minPersonas);
    maxPersonas.set(draft.maxPersonas);
    activo.set(draft.activo);
    slugCtl.set(draft.slug);
    incluye.setItems(draft.incluye);
  }

  collect = () => {
    draft.precio = precio.get();
    draft.currency = currency.get() as SeminarioDraft['currency'];
    // Die Radiogruppe kann keinen dritten Wert liefern; die Prüfung steht
    // trotzdem da, weil eine falsch geratene Preisart der teuerste Fehler
    // dieses Formulars wäre.
    draft.precioTipo = precioTipo.get() === 'total' ? 'total' : 'porPersona';
    draft.numero = numero.get();
    draft.pigmento = pigmento.get() as SeminarioDraft['pigmento'];
    draft.duracion = duracion.get();
    draft.minPersonas = minPersonas.get();
    draft.maxPersonas = maxPersonas.get();
    draft.activo = activo.get();
    draft.slug = slugCtl.get();
    draft.title = fTitle.get();
    draft.summary = fSummary.get();
    draft.longDesc = fLongDesc.get();
    draft.necesitamos = fNecesitamos.get();
    draft.incluye = incluye.getItems().filter((x) => x.es || x.en);
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
    shell.setSectionState('incluye', draft.incluye.length ? 'ok' : 'empty');
    // Ein Preis von null ist bei einem Seminar kein gültiger Zustand,
    // sondern ein vergessenes Feld -- deshalb 'partial' und nicht 'ok'.
    shell.setSectionState('precio', draft.precio > 0 ? 'ok' : 'partial');
    shell.setSectionState(
      'datos',
      draft.duracion > 0 && draft.minPersonas > 0 && draft.maxPersonas >= draft.minPersonas
        ? 'ok'
        : 'partial',
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
        draft.slug = await ensureUniqueSlug('on_tour_seminarios', base, row?.id ?? '');
        slugCtl.set(draft.slug);
      }
    }

    const patch = seminarioPatch(draft);

    if (!row) {
      row = await seminarioStore.create({ ...patch, status: 'draft' });
    } else {
      await seminarioStore.update(row.id, patch);
      row.has_unpublished_changes = row.status === 'published';
    }
    badge();
  }

  wireShell(shell, saver, {
    publish: async () => {
      if (!row) return;
      await seminarioStore.publish(row.id);
      row.status = 'published';
      row.has_unpublished_changes = false;
      badge();
    },
    discard: async () => {
      if (!row) return;
      const ok = await confirmDialog({
        title: '¿Descartar los cambios sin publicar?',
        body: 'El seminario vuelve a como está ahora en la web.',
        confirmLabel: 'Descartar',
        tone: 'danger',
      });
      if (!ok) return;
      await seminarioStore.discardChanges(row.id);
      toast('Se descartaron los cambios.', { tone: 'ok' });
      navigate({ view: 'seminario', id: row.id }, { replace: true });
    },
    back: () => navigate({ view: 'onTour' }),
  });

  refreshHeader();

  teardown = () => {
    saver.destroy();
    preview.destroy();
    incluye.destroy();
    shell.destroy();
  };
}

/* ===========================================================================
   Editor: Anfahrtszone
   =========================================================================== */

export async function mountZonaEditor(container: HTMLElement, id: string): Promise<void> {
  const isNew = id === 'nueva';

  let row: ZonaRow | null = null;
  let draft: ZonaDraft;

  const all = await zonaStore.list();

  if (isNew) {
    draft = emptyZonaDraft();
    draft.slug = draftSlug('zona');
    // Eine neue Zone gehört ans Ende des Rings: sie ist fast immer die
    // entferntere. Wer es anders will, ändert die Zahl -- aber niemand muss
    // sich beim Anlegen erst überlegen, welche Nummer noch frei ist.
    draft.orden = all.reduce((max, z) => Math.max(max, Number(z.orden) || 0), 0) + 1;
  } else {
    row = all.find((r) => r.id === id) ?? null;
    if (!row) {
      toast('Esa zona ya no existe.', { tone: 'error' });
      navigate({ view: 'onTour' }, { replace: true });
      return;
    }
    draft = draftFromZona(row);
  }

  const shell = editorShell({ backLabel: 'On Tour' });
  container.append(shell.root);

  const fields: PairedField[] = [];
  let collect: () => void = () => {};

  const preview = zonaPreview(() => {
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

  /* ---------------- Abschnitt: Traslado ---------------- */

  const trasladoSection = shell.addSection('traslado', 'Cuánto cuesta el traslado');

  const tipo = radioCards({
    label: '¿Hay un monto fijo?',
    options: ZONA_TIPO_OPTIONS,
    onChange: () => {
      // Sofort umschalten, nicht erst beim nächsten Neuzeichnen: das
      // Betragsfeld darf gar nicht erst dastehen, wenn es nicht gilt.
      syncTipo();
      touched();
    },
  });

  const recargo = numberField({
    label: 'Recargo',
    hint: 'Se suma una sola vez por fecha, no por persona. 0 quiere decir que el traslado está incluido.',
    min: 0,
    step: 50,
    onInput: touched,
  });
  const currency = selectField({
    label: 'Moneda',
    options: CURRENCY_OPTIONS,
    onChange: touched,
  });
  const montoRow = controlRow(recargo, currency);

  const orden = numberField({
    label: 'Orden en la lista',
    hint: 'De más cerca a más lejos. Así se lee la lista en la web: anillos que se van alejando de la chacra.',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });

  trasladoSection.append(tipo.el, montoRow, controlRow(orden));

  /**
   * Zeigt oder versteckt das Betragsfeld.
   *
   * Bei "a calcular" GIBT es keinen Betrag -- in der Datenbank steht dort
   * null (siehe on_tour_zonas_a_pedido_check). Ein Feld mit einer 0 darin,
   * das gerade nicht zählt, wäre genau die Verwechslung, die diese Migration
   * verhindern soll: 0 heißt "Fahrt kostet nichts", und das ist etwas ganz
   * anderes als "wissen wir noch nicht".
   */
  function syncTipo(): void {
    montoRow.hidden = tipo.get() === 'pedido';
  }

  /* ---------------- Abschnitt: Textos ---------------- */

  const textSection = shell.addSection('textos', 'Textos');

  function bilingual(
    label: string,
    value: Bilingual,
    o: { type?: 'text' | 'textarea'; rows?: number; hint?: string; required?: boolean } = {},
  ): PairedField {
    const field = pairedField({ label, onInput: touched, ...o });
    field.set(value);
    fields.push(field);
    textSection.append(field.el);
    return field;
  }

  const fNombre = bilingual('Nombre de la zona', draft.nombre, {
    required: true,
    hint: 'Corto, como se lee en la lista: “Costa cercana”, “Resto del país”.',
  });
  const fDetalle = bilingual('Qué localidades entran', draft.detalle, {
    type: 'textarea',
    rows: 2,
    required: true,
    // Das ist der Satz, der die Frage "bin ich da drin?" beantwortet --
    // ohne ihn schreibt jeder zweite Interessent eine Mail statt einer
    // Anfrage.
    hint: 'Es lo que contesta “¿mi lugar entra acá?”. Nombrá los pueblos.',
  });

  /* ---------------- Abschnitt: Ajustes avanzados ---------------- */

  const advSection = shell.addSection('avanzado', 'Ajustes avanzados');
  const slugCtl = textField({
    label: 'Nombre interno (slug)',
    hint: 'Es el valor que viaja en el formulario de solicitud. Cambialo sólo si sabés por qué.',
    onInput: touched,
  });
  advSection.append(slugCtl.el);

  /* ---------------- Gefahrenzone ---------------- */

  const danger = shell.dangerZone();
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--ghost adm-btn--danger';
  del.textContent = 'Eliminar esta zona';
  danger.append(del);

  del.addEventListener('click', () => {
    void (async () => {
      const name = draft.nombre.es || 'esta zona';
      const ok = await confirmDialog({
        title: `¿Eliminar “${name}”?`,
        body: 'Desaparece del panel y de la web, pero podés recuperarla durante 30 días. Ojo: si borrás una zona, los lugares que estaban en ella se quedan sin respuesta en el formulario.',
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok || !row) return;
      try {
        await zonaStore.remove(row.id);
        toast('Zona eliminada.', { tone: 'ok' });
        setLeaveGuard(null);
        navigate({ view: 'onTour' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    })();
  });

  /* ---------------- Werte hinein und wieder heraus ---------------- */

  function fill(): void {
    tipo.set(draft.aPedido ? 'pedido' : 'fijo');
    recargo.set(draft.recargo);
    currency.set(draft.currency);
    orden.set(draft.orden);
    slugCtl.set(draft.slug);
    syncTipo();
  }

  collect = () => {
    draft.aPedido = tipo.get() === 'pedido';
    draft.recargo = recargo.get();
    draft.currency = currency.get() as ZonaDraft['currency'];
    draft.orden = orden.get();
    draft.slug = slugCtl.get();
    draft.nombre = fNombre.get();
    draft.detalle = fDetalle.get();
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
    shell.setTitle(draft.nombre.es);
    const c = completeness(fields);
    shell.setCompleteness(c.es, c.en, () => c.firstMissing?.field.focus(c.firstMissing.lang));

    const textState =
      c.es.done === c.es.total && c.en.done === c.en.total
        ? 'ok'
        : c.es.done + c.en.done === 0
          ? 'empty'
          : 'partial';
    shell.setSectionState('textos', textState);
    // Anders als beim Seminarpreis ist die 0 hier ein gültiger, gewollter
    // Wert ("Incluido") -- der Abschnitt ist also vollständig, sobald eine
    // der beiden Karten gewählt und die Reihenfolge gesetzt ist.
    shell.setSectionState('traslado', draft.orden > 0 ? 'ok' : 'partial');
    shell.setSectionState('avanzado', 'ok');
    badge();
  }

  /* ---------------- Speichern ---------------- */

  async function persist(): Promise<void> {
    collect();

    if (draft.nombre.es && (isDraftSlug(draft.slug) || !draft.slug)) {
      const base = slugify(draft.nombre.es);
      if (base) {
        draft.slug = await ensureUniqueSlug('on_tour_zonas', base, row?.id ?? '');
        slugCtl.set(draft.slug);
      }
    }

    const patch = zonaPatch(draft);

    if (!row) {
      row = await zonaStore.create({ ...patch, status: 'draft' });
    } else {
      await zonaStore.update(row.id, patch);
      row.has_unpublished_changes = row.status === 'published';
    }
    badge();
  }

  wireShell(shell, saver, {
    publish: async () => {
      if (!row) return;
      await zonaStore.publish(row.id);
      row.status = 'published';
      row.has_unpublished_changes = false;
      badge();
    },
    discard: async () => {
      if (!row) return;
      const ok = await confirmDialog({
        title: '¿Descartar los cambios sin publicar?',
        body: 'La zona vuelve a como está ahora en la web.',
        confirmLabel: 'Descartar',
        tone: 'danger',
      });
      if (!ok) return;
      await zonaStore.discardChanges(row.id);
      toast('Se descartaron los cambios.', { tone: 'ok' });
      navigate({ view: 'zona', id: row.id }, { replace: true });
    },
    back: () => navigate({ view: 'onTour' }),
  });

  refreshHeader();

  teardown = () => {
    saver.destroy();
    preview.destroy();
    shell.destroy();
  };
}

/* ===========================================================================
   Gemeinsames für beide Editoren
   =========================================================================== */

type Shell = ReturnType<typeof editorShell>;
type Saver = ReturnType<typeof createAutoSaver>;

/**
 * Knöpfe der Kopfzeile und der Verlassen-Schutz.
 *
 * Bei den Talleres und Módulos steht dieser Block zweimal wortgleich in
 * derselben Datei; hier wären es drei Kopien (Seminar, Zone), und die dritte
 * ist eine zu viel. Der einzige Unterschied zwischen den Editoren sind die
 * drei übergebenen Funktionen -- alles andere, insbesondere die
 * Fehlerbehandlung und der Verlassen-Schutz aus Problem P3, ist identisch.
 */
function wireShell(
  shell: Shell,
  saver: Saver,
  o: {
    publish: () => Promise<void>;
    discard: () => Promise<void>;
    back: () => void;
  },
): void {
  shell.onSaveNow(async () => {
    try {
      await saver.flush();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onPublish(async () => {
    try {
      // Erst schreiben, dann veröffentlichen: publish_* macht einen
      // Schnappschuss der Zeile, wie sie in der Datenbank steht -- ein noch
      // nicht gespeicherter Tastendruck wäre sonst nicht dabei.
      await saver.flush();
      await o.publish();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      throw err;
    }
  });

  shell.onDiscard(async () => {
    try {
      await o.discard();
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onBack(o.back);

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
}
