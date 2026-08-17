import { workshopThemes, type ThemeId } from '../../data/workshop-themes';
import { formatDate, formatPrice } from '../../data/workshops';
import { confirmDialog } from './dialog';
import { createAutoSaver } from './dirty';
import { completeness, pairedField, type PairedField } from './fields';
import { listEditor } from './list-editor';
import { editorShell } from './editor-shell';
import { entityList, type ListCard } from './entity-list';
import { workshopPreview } from './preview';
import { navigate, setLeaveGuard } from './router';
import { createStore } from './store';
import { draftSlug, ensureUniqueSlug, isDraftSlug, slugify } from './slug';
import { toast } from './toast';
import { humanError, isSessionCancelled } from './errors';
import {
  draftFromWorkshop,
  emptyWorkshopDraft,
  workshopPatch,
  type Bilingual,
  type ProgrammeStepDraft,
  type WorkshopDraft,
  type WorkshopRow,
} from './drafts';
import {
  controlRow,
  dateField,
  numberField,
  radioCards,
  selectField,
  switchRow,
  textField,
  type Control,
} from './controls';

/**
 * Talleres: Liste und Editor.
 *
 * Beides sind Ansichten derselben Seite (Spec 2.1) -- das Modal von v1 gibt
 * es nicht mehr. Die Liste zeigt, was zum Beurteilen nötig ist: Zustand,
 * nächster Termin, ob Englisch fehlt (Problem P8). Der Editor speichert
 * beim Tippen und veröffentlicht nur auf ausdrücklichen Knopfdruck.
 */

const store = createStore<WorkshopRow>('workshops');

let teardown: (() => void) | null = null;

export function unmount(): void {
  teardown?.();
  teardown = null;
  setLeaveGuard(null);
}

/* ===========================================================================
   Liste
   =========================================================================== */

function nextDate(dates: string[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  return dates.filter((d) => d >= today).sort()[0] ?? null;
}

/** Wie viele der acht Pflichttexte je Sprache stehen. */
function filledCount(row: WorkshopRow, lang: 'es' | 'en'): number {
  const t = row.translations?.[lang] ?? {};
  const keys = ['title', 'summary', 'audience', 'longDesc'] as const;
  return keys.filter((k) => typeof t[k] === 'string' && t[k]!.trim()).length;
}

export async function mountList(container: HTMLElement): Promise<void> {
  const view = entityList<WorkshopRow>({
    title: 'Talleres',
    newLabel: '+ Nuevo taller',
    emptyText: 'Todavía no hay talleres. Creá el primero.',
    searchPlaceholder: 'Buscar taller…',
    load: () => store.list(),
    onNew: () => navigate({ view: 'taller', id: 'nuevo' }),
    onOpen: (row) => navigate({ view: 'taller', id: row.id }),
    onReorder: (row, value) => store.setSortOrder(row.id, value),
    onArchive: async (row, archived) => {
      await store.setStatus(row.id, archived ? 'archived' : 'published');
    },
    onDelete: (row) => store.remove(row.id),
    nameOf: (row) => row.translations?.es?.title || 'Sin título',
    card: (row): ListCard => {
      const theme = workshopThemes[row.theme_id as ThemeId];
      const upcoming = nextDate(Array.isArray(row.dates) ? row.dates : []);
      return {
        art: theme ? `<svg viewBox="0 0 90 90">${theme.cardIcon}</svg>` : '',
        title: row.translations?.es?.title || 'Sin título',
        meta: [
          theme?.label.es ?? row.theme_id,
          formatPrice(Number(row.price), row.currency),
          `${row.hours} h · ${row.max_people} personas`,
          upcoming
            ? `Próxima fecha: ${formatDate(upcoming, 'es')}`
            : 'Sin fechas próximas',
        ],
        es: filledCount(row, 'es'),
        en: filledCount(row, 'en'),
        total: 4,
      };
    },
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

  let row: WorkshopRow | null = null;
  let draft: WorkshopDraft;

  if (isNew) {
    draft = emptyWorkshopDraft();
    draft.slug = draftSlug('taller');
  } else {
    const all = await store.list();
    row = all.find((r) => r.id === id) ?? null;
    if (!row) {
      toast('Ese taller ya no existe.', { tone: 'error' });
      navigate({ view: 'talleres' }, { replace: true });
      return;
    }
    draft = draftFromWorkshop(row);
  }

  const shell = editorShell({ backLabel: 'Talleres' });
  container.append(shell.root);

  const fields: PairedField[] = [];
  const controls: Control<unknown>[] = [];

  /** Sammelt alle Eingaben in den Entwurf zurück. */
  let collect: () => void = () => {};

  const preview = workshopPreview(() => {
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

  /* ---------------- Abschnitt: Thema ---------------- */

  const themeSection = shell.addSection('tema', 'Tema');
  const themeCtl = radioCards({
    label: 'Ilustración y color del taller',
    options: (Object.keys(workshopThemes) as ThemeId[]).map((key) => ({
      value: key,
      label: workshopThemes[key].label.es,
      art: workshopThemes[key].cardIcon,
    })),
    onChange: touched,
  });
  themeCtl.set(draft.themeId);
  themeSection.append(themeCtl.el);

  /* ---------------- Abschnitt: Datos ---------------- */

  const dataSection = shell.addSection('datos', 'Datos');
  const price = numberField({ label: 'Precio', min: 0, step: 0.5, onInput: touched });
  const currency = selectField({
    label: 'Moneda',
    options: ['USD', 'UYU', 'EUR', 'ARS'].map((c) => ({ value: c, label: c })),
    onChange: touched,
  });
  const hours = numberField({ label: 'Duración', min: 0.5, step: 0.5, unit: 'h', onInput: touched });
  const maxPeople = numberField({
    label: 'Máximo de personas',
    min: 1,
    step: 1,
    integer: true,
    onInput: touched,
  });
  const first = textField({ label: 'Nombre de quien lo da', onInput: touched });
  const last = textField({ label: 'Apellido', onInput: touched });
  controls.push(price, currency, hours, maxPeople, first, last);
  dataSection.append(
    controlRow(price, currency, hours, maxPeople),
    controlRow(first, last),
  );

  /* ---------------- Abschnitt: Fechas ---------------- */

  const datesSection = shell.addSection('fechas', 'Fechas');
  const dates = listEditor<string>({
    addLabel: '+ Agregar fecha',
    emptyText: 'Sin fechas. El taller se muestra igual, pero sin próximas citas.',
    itemNoun: 'fecha',
    createEmpty: () => '',
    onChange: touched,
    renderRow: (value, api) => {
      const ctl = dateField({ onInput: api.onInput });
      ctl.set(value);
      const body = document.createElement('div');
      body.className = 'adm-le__body';
      body.append(ctl.el);
      return { el: body, read: () => ctl.get(), focus: () => ctl.focus() };
    },
  });
  datesSection.append(dates.el);

  /* ---------------- Abschnitt: Textos ---------------- */

  const textSection = shell.addSection('textos', 'Textos');

  function bilingual(
    label: string,
    value: Bilingual,
    o: { type?: 'text' | 'textarea'; rows?: number; maxLength?: number; hint?: string; required?: boolean } = {},
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
    maxLength: 160,
    required: true,
    hint: 'Es el texto que se ve en la tarjeta.',
  });
  const fAudience = bilingual('Para quién (etiqueta corta)', draft.audience, { required: true });
  const fLongDesc = bilingual('Descripción completa', draft.longDesc, {
    type: 'textarea',
    rows: 4,
    required: true,
  });
  const fForWhom = bilingual('Para quién es (texto largo)', draft.forWhom, {
    type: 'textarea',
    rows: 2,
  });
  const fLanguages = bilingual('Idiomas', draft.languages);
  const fMeeting = bilingual('Punto de encuentro', draft.meetingPoint, {
    type: 'textarea',
    rows: 2,
  });

  /* ---------------- Abschnitt: Programa ---------------- */

  const progSection = shell.addSection('programa', 'Cómo es el encuentro');
  const programme = listEditor<ProgrammeStepDraft>({
    addLabel: '+ Agregar paso',
    emptyText: 'Sin pasos cargados.',
    itemNoun: 'paso',
    createEmpty: () => ({ title: { es: '', en: '' }, text: { es: '', en: '' } }),
    onChange: touched,
    renderRow: (item, api) => {
      const title = pairedField({ label: 'Título del paso', onInput: api.onInput });
      const text = pairedField({ label: 'Descripción', type: 'textarea', rows: 2, onInput: api.onInput });
      title.set(item.title);
      text.set(item.text);
      const body = document.createElement('div');
      body.className = 'adm-le__body';
      body.append(title.el, text.el);
      return {
        el: body,
        read: () => ({ title: title.get(), text: text.get() }),
        focus: () => title.focus(),
      };
    },
  });
  programme.el.classList.add('adm-le--numbered');
  progSection.append(programme.el);

  /* ---------------- Abschnitt: Listas ---------------- */

  const listsSection = shell.addSection('listas', 'Qué incluye y qué traer');

  function bilingualList(addLabel: string, emptyText: string, noun: string) {
    return listEditor<Bilingual>({
      addLabel,
      emptyText,
      itemNoun: noun,
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
  }

  const included = bilingualList('+ Agregar', 'Sin ítems.', 'ítem');
  const bring = bilingualList('+ Agregar', 'Sin ítems.', 'ítem');
  listsSection.append(
    Object.assign(document.createElement('h3'), {
      className: 'adm-ed__sublabel',
      textContent: 'Qué incluye',
    }),
    included.el,
    Object.assign(document.createElement('h3'), {
      className: 'adm-ed__sublabel',
      textContent: 'Qué traer',
    }),
    bring.el,
  );

  /* ---------------- Abschnitt: Qué se muestra ---------------- */

  const showSection = shell.addSection('bloques', 'Qué se muestra en la ficha');
  const showCtls: Record<keyof WorkshopDraft['show'], Control<boolean>> = {
    programme: switchRow({ label: 'Cómo es el encuentro', onChange: touched }),
    included: switchRow({ label: 'Qué incluye', onChange: touched }),
    bring: switchRow({ label: 'Qué traer', onChange: touched }),
    forWhom: switchRow({ label: 'Para quién es', onChange: touched }),
    languages: switchRow({ label: 'Idiomas', onChange: touched }),
    meetingPoint: switchRow({ label: 'Punto de encuentro', onChange: touched }),
  };
  for (const ctl of Object.values(showCtls)) showSection.append(ctl.el);

  /* ---------------- Abschnitt: Ajustes avanzados ---------------- */

  const advSection = shell.addSection('avanzado', 'Ajustes avanzados');
  const slugCtl = textField({
    label: 'Dirección en la web (slug)',
    hint: 'Si lo cambiás, el enlace anterior deja de funcionar.',
    onInput: touched,
  });
  controls.push(slugCtl);
  advSection.append(slugCtl.el);

  /* ---------------- Gefahrenzone ---------------- */

  const danger = shell.dangerZone();
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--ghost adm-btn--danger';
  del.textContent = 'Eliminar este taller';
  danger.append(del);

  del.addEventListener('click', () => {
    void (async () => {
      const name = draft.title.es || 'este taller';
      const ok = await confirmDialog({
        title: `¿Eliminar “${name}”?`,
        body: 'Se borra para siempre y no se puede deshacer. Si sólo querés sacarlo de la web, archivalo.',
        confirmLabel: 'Eliminar para siempre',
        tone: 'danger',
      });
      if (!ok || !row) return;
      try {
        await store.remove(row.id);
        toast('Taller eliminado.', { tone: 'ok' });
        setLeaveGuard(null);
        navigate({ view: 'talleres' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    })();
  });

  /* ---------------- Werte hinein und wieder heraus ---------------- */

  function fill(): void {
    price.set(draft.price);
    currency.set(draft.currency);
    hours.set(draft.hours);
    maxPeople.set(draft.maxPeople);
    first.set(draft.instructorFirstName);
    last.set(draft.instructorLastName);
    slugCtl.set(draft.slug);
    dates.setItems(draft.dates);
    programme.setItems(draft.programme);
    included.setItems(draft.included);
    bring.setItems(draft.bring);
    for (const key of Object.keys(showCtls) as (keyof WorkshopDraft['show'])[]) {
      showCtls[key].set(draft.show[key]);
    }
  }

  collect = () => {
    draft.themeId = themeCtl.get() as ThemeId;
    draft.price = price.get();
    draft.currency = currency.get() as WorkshopDraft['currency'];
    draft.hours = hours.get();
    draft.maxPeople = maxPeople.get();
    draft.instructorFirstName = first.get();
    draft.instructorLastName = last.get();
    draft.slug = slugCtl.get();
    draft.dates = dates.getItems().filter(Boolean).sort();
    draft.title = fTitle.get();
    draft.summary = fSummary.get();
    draft.audience = fAudience.get();
    draft.longDesc = fLongDesc.get();
    draft.forWhom = fForWhom.get();
    draft.languages = fLanguages.get();
    draft.meetingPoint = fMeeting.get();
    draft.programme = programme.getItems();
    draft.included = included.getItems().filter((x) => x.es || x.en);
    draft.bring = bring.getItems().filter((x) => x.es || x.en);
    for (const key of Object.keys(showCtls) as (keyof WorkshopDraft['show'])[]) {
      draft.show[key] = showCtls[key].get();
    }
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

    const textState = c.es.done === c.es.total && c.en.done === c.en.total
      ? 'ok'
      : c.es.done + c.en.done === 0
        ? 'empty'
        : 'partial';
    shell.setSectionState('textos', textState);
    shell.setSectionState('fechas', draft.dates.length ? 'ok' : 'empty');
    shell.setSectionState('programa', draft.programme.length ? 'ok' : 'empty');
    shell.setSectionState(
      'listas',
      draft.included.length && draft.bring.length
        ? 'ok'
        : draft.included.length || draft.bring.length
          ? 'partial'
          : 'empty',
    );
    shell.setSectionState('tema', 'ok');
    shell.setSectionState('datos', draft.price > 0 && draft.hours > 0 ? 'ok' : 'partial');
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
        draft.slug = await ensureUniqueSlug('workshops', base, row?.id ?? '');
        slugCtl.set(draft.slug);
      }
    }

    const patch = workshopPatch(draft);

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
      body: 'El taller vuelve a como está ahora en la web.',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await store.discardChanges(row.id);
      toast('Se descartaron los cambios.', { tone: 'ok' });
      navigate({ view: 'taller', id: row.id }, { replace: true });
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onBack(() => navigate({ view: 'talleres' }));

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
    dates.destroy();
    programme.destroy();
    included.destroy();
    bring.destroy();
    shell.destroy();
  };
}
