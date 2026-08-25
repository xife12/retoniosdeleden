import { casaGlyphLabels, casaGlyphs, factGlyphs, type CasaGlyph } from '../../data/casa-glyphs';
import type { CasaStatus } from '../../data/casas';
import { confirmDialog } from './dialog';
import { createAutoSaver } from './dirty';
import { completeness, pairedField, type PairedField } from './fields';
import { listEditor } from './list-editor';
import { editorShell } from './editor-shell';
import { entityList, type ListCard } from './entity-list';
import { casaPreview } from './preview';
import { photoManager } from './photos';
import { navigate, setLeaveGuard } from './router';
import { createStore } from './store';
import { draftSlug, ensureUniqueSlug, isDraftSlug, slugify } from './slug';
import { toast } from './toast';
import { humanError, isSessionCancelled } from './errors';
import { fetchCasaImages } from './image-upload';
import {
  casaPatch,
  draftFromCasa,
  emptyCasaDraft,
  type Bilingual,
  type CasaAmenityDraft,
  type CasaDraft,
  type CasaHighlightDraft,
  type CasaRow,
} from './drafts';
import {
  controlRow,
  iconSelectField,
  numberField,
  selectField,
  textField,
  type Control,
} from './controls';

/**
 * Casas de barro: Liste und Editor.
 *
 * Aufbau wie `workshops-view.ts`; der Unterschied sind die Fotos. Damit sie
 * ab Sekunde eins funktionieren (Problem P11), legt „Nueva casa" sofort eine
 * Entwurfszeile an -- eine `id` muss existieren, bevor eine Datei in den
 * Storage kann. Bleibt der Entwurf leer und unberührt, wird er beim
 * Verlassen wieder entfernt, damit keine Karteileichen entstehen.
 *
 * Achtung Begriffe: `status` ist der Veröffentlichungszustand,
 * `build_status` der Baufortschritt.
 */

const store = createStore<CasaRow>('casas');

const BUILD_OPTIONS: { value: CasaStatus; label: string }[] = [
  { value: 'listo', label: 'Terminada' },
  { value: 'enObra', label: 'En obra' },
  { value: 'planeado', label: 'Planeada' },
];

const BUILD_LABEL: Record<CasaStatus, string> = {
  listo: 'Terminada',
  enObra: 'En obra',
  planeado: 'Planeada',
};

/** Glyphen, die schon die Faktenzeile belegt, fehlen hier bewusst. */
const pickable = (Object.keys(casaGlyphs) as CasaGlyph[]).filter(
  (g) => !factGlyphs.includes(g),
);

let teardown: (() => void) | null = null;

export function unmount(): void {
  teardown?.();
  teardown = null;
  setLeaveGuard(null);
}

/* ===========================================================================
   Liste
   =========================================================================== */

function filledCount(row: CasaRow, lang: 'es' | 'en'): number {
  const t = row.translations?.[lang] ?? {};
  const keys = ['title', 'tagline', 'bookNote'] as const;
  return keys.filter((k) => typeof t[k] === 'string' && t[k]!.trim()).length;
}

export async function mountList(container: HTMLElement): Promise<void> {
  /** Erstes Foto je Haus, für die Miniatur in der Liste. */
  const thumbs = new Map<string, string>();

  const view = entityList<CasaRow>({
    title: 'Casas de barro',
    newLabel: '+ Nueva casa',
    emptyText: 'Todavía no hay casas. Creá la primera.',
    searchPlaceholder: 'Buscar casa…',
    load: async () => {
      const list = await store.list();
      await Promise.all(
        list.map(async (row) => {
          if (thumbs.has(row.id)) return;
          try {
            const images = await fetchCasaImages(row.id);
            if (images[0]) thumbs.set(row.id, images[0].url);
          } catch {
            /* Ohne Miniatur zeigt die Karte die Zeichnung -- kein Grund zu stören. */
          }
        }),
      );
      return list;
    },
    onNew: () => navigate({ view: 'casa', id: 'nuevo' }),
    onOpen: (row) => navigate({ view: 'casa', id: row.id }),
    onReorder: (row, value) => store.setSortOrder(row.id, value),
    onArchive: async (row, archived) => {
      await store.setStatus(row.id, archived ? 'archived' : 'published');
    },
    onDelete: (row) => store.remove(row.id),
    nameOf: (row) => row.translations?.es?.title || 'Sin nombre',
    card: (row): ListCard => ({
      thumb: thumbs.get(row.id),
      art: casaGlyphs.clay,
      title: row.translations?.es?.title || 'Sin nombre',
      meta: [
        BUILD_LABEL[row.build_status] ?? row.build_status,
        `${row.beds} camas · ${row.guests} huéspedes`,
        `${row.area} m²`,
      ],
      es: filledCount(row, 'es'),
      en: filledCount(row, 'en'),
      total: 3,
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
  let row: CasaRow | null = null;
  let draft: CasaDraft;
  /** Nur wahr, solange ein frisch angelegter Entwurf unberührt ist. */
  let pristineNew = false;

  if (id === 'nuevo') {
    draft = emptyCasaDraft();
    draft.slug = draftSlug('casa');
    try {
      // Die Zeile muss existieren, bevor ein Foto hochgeladen werden kann.
      row = await store.create({ ...casaPatch(draft), status: 'draft' });
      pristineNew = true;
      navigate({ view: 'casa', id: row.id }, { replace: true });
      return;
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      navigate({ view: 'casas' }, { replace: true });
      return;
    }
  }

  const all = await store.list();
  row = all.find((r) => r.id === id) ?? null;
  if (!row) {
    toast('Esa casa ya no existe.', { tone: 'error' });
    navigate({ view: 'casas' }, { replace: true });
    return;
  }
  draft = draftFromCasa(row);
  pristineNew = row.status === 'draft' && isDraftSlug(row.slug) && !row.translations?.es?.title;

  const shell = editorShell({ backLabel: 'Casas' });
  container.append(shell.root);

  const fields: PairedField[] = [];
  let collect: () => void = () => {};

  const photos = photoManager({
    casaId: row.id,
    onChange: () => {
      pristineNew = false;
      touched();
    },
  });

  const preview = casaPreview(() => {
    collect();
    return draft;
  });
  shell.setPreview(preview.el);

  const saver = createAutoSaver({
    save: () => persist(),
    onState: (state, at) => shell.setSaveState(state, at),
  });

  function touched(): void {
    pristineNew = false;
    collect();
    saver.markDirty();
    preview.update();
    refreshHeader();
  }

  /* ---------------- Abschnitt: Obra ---------------- */

  const obraSection = shell.addSection('obra', 'La obra');
  const buildCtl = selectField({
    label: 'Estado de la obra',
    hint: 'Decide qué dibujo se muestra cuando no hay fotos.',
    options: BUILD_OPTIONS,
    onChange: touched,
  });
  const airbnb = textField({
    label: 'Link de Airbnb',
    placeholder: 'https://www.airbnb.com/…',
    hint: 'Sin link, la ficha ofrece el formulario de contacto.',
    onInput: touched,
  });
  obraSection.append(controlRow(buildCtl), airbnb.el);

  /* ---------------- Abschnitt: Números ---------------- */

  const numSection = shell.addSection('numeros', 'Números');
  const beds = numberField({ label: 'Camas', min: 0, step: 1, integer: true, onInput: touched });
  const guests = numberField({ label: 'Huéspedes', min: 0, step: 1, integer: true, onInput: touched });
  const area = numberField({ label: 'Superficie', min: 0, step: 0.5, unit: 'm²', onInput: touched });
  const bedrooms = numberField({ label: 'Dormitorios', min: 0, step: 1, integer: true, onInput: touched });
  const bathrooms = numberField({ label: 'Baños', min: 0, step: 1, integer: true, onInput: touched });
  numSection.append(
    controlRow(beds, guests, area),
    controlRow(bedrooms, bathrooms),
  );

  /* ---------------- Abschnitt: Fotos ---------------- */

  const photoSection = shell.addSection('fotos', 'Fotos');
  photoSection.append(photos.el);
  await photos.load();
  draft.images = photos.items();

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

  const fTitle = bilingual('Nombre de la casa', draft.title, { required: true });
  const fTagline = bilingual('Frase corta', draft.tagline, {
    type: 'textarea',
    rows: 2,
    required: true,
    hint: 'Se ve en la tarjeta y arriba en la ficha.',
  });
  const fBookNote = bilingual('Nota sobre reservas', draft.bookNote, {
    type: 'textarea',
    rows: 2,
    required: true,
  });

  const bodySection = shell.addSection('descripcion', 'Descripción');
  const body = listEditor<Bilingual>({
    addLabel: '+ Agregar párrafo',
    emptyText: 'Sin párrafos todavía.',
    itemNoun: 'párrafo',
    createEmpty: () => ({ es: '', en: '' }),
    onChange: touched,
    renderRow: (item, api) => {
      const field = pairedField({ label: '', type: 'textarea', rows: 3, onInput: api.onInput });
      field.set(item);
      const el = document.createElement('div');
      el.className = 'adm-le__body';
      el.append(field.el);
      return { el, read: () => field.get(), focus: () => field.focus() };
    },
  });
  bodySection.append(body.el);

  /* ---------------- Abschnitt: Equipamiento ---------------- */

  const gearSection = shell.addSection('equipamiento', 'Equipamiento y detalles');

  function glyphSelect(selected: CasaGlyph, onChange: () => void): Control<string> {
    const ctl = iconSelectField({
      label: 'Dibujo',
      options: pickable.map((g) => ({ value: g, label: casaGlyphLabels[g].es, art: casaGlyphs[g] })),
      onChange,
    });
    ctl.set(selected);
    return ctl;
  }

  const amenities = listEditor<CasaAmenityDraft>({
    addLabel: '+ Agregar',
    emptyText: 'Sin equipamiento cargado.',
    itemNoun: 'ítem',
    createEmpty: () => ({ glyph: pickable[0], label: { es: '', en: '' } }),
    onChange: touched,
    renderRow: (item, api) => {
      const glyph = glyphSelect(item.glyph, api.onInput);
      const label = pairedField({ label: 'Texto', onInput: api.onInput });
      label.set(item.label);
      const el = document.createElement('div');
      el.className = 'adm-le__body';
      el.append(glyph.el, label.el);
      return {
        el,
        read: () => ({ glyph: glyph.get() as CasaGlyph, label: label.get() }),
        focus: () => label.focus(),
      };
    },
  });

  const highlights = listEditor<CasaHighlightDraft>({
    addLabel: '+ Agregar',
    emptyText: 'Sin detalles especiales cargados.',
    itemNoun: 'detalle',
    createEmpty: () => ({ glyph: pickable[0], label: { es: '', en: '' }, note: { es: '', en: '' } }),
    onChange: touched,
    renderRow: (item, api) => {
      const glyph = glyphSelect(item.glyph, api.onInput);
      const label = pairedField({ label: 'Título', onInput: api.onInput });
      const note = pairedField({ label: 'Explicación', type: 'textarea', rows: 2, onInput: api.onInput });
      label.set(item.label);
      note.set(item.note);
      const el = document.createElement('div');
      el.className = 'adm-le__body';
      el.append(glyph.el, label.el, note.el);
      return {
        el,
        read: () => ({
          glyph: glyph.get() as CasaGlyph,
          label: label.get(),
          note: note.get(),
        }),
        focus: () => label.focus(),
      };
    },
  });

  gearSection.append(
    Object.assign(document.createElement('h3'), {
      className: 'adm-ed__sublabel',
      textContent: 'Equipamiento',
    }),
    amenities.el,
    Object.assign(document.createElement('h3'), {
      className: 'adm-ed__sublabel',
      textContent: 'Lo que la hace especial',
    }),
    highlights.el,
  );

  /* ---------------- Abschnitt: Ajustes avanzados ---------------- */

  const advSection = shell.addSection('avanzado', 'Ajustes avanzados');
  const slugCtl = textField({
    label: 'Dirección en la web (slug)',
    hint: 'Si lo cambiás, el enlace anterior deja de funcionar.',
    onInput: touched,
  });
  advSection.append(slugCtl.el);

  /* ---------------- Gefahrenzone ---------------- */

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--ghost adm-btn--danger';
  del.textContent = 'Eliminar esta casa';
  shell.dangerZone().append(del);

  del.addEventListener('click', () => {
    void (async () => {
      const name = draft.title.es || 'esta casa';
      const count = photos.items().length;
      const ok = await confirmDialog({
        title: `¿Eliminar “${name}”?`,
        // Die Fotos bleiben unangetastet: das Soft-Delete setzt nur
        // deleted_at, die Zeile steht weiter da, also greift auch kein
        // "on delete cascade" auf casa_images. Der alte Satz "se borran
        // también las N fotos" waere jetzt schlicht falsch.
        body: count
          ? `Desaparece del panel y de la web, con sus ${count} fotos, pero podés recuperarla durante 30 días. Si sólo querés sacarla de la web, archivala.`
          : 'Desaparece del panel y de la web, pero podés recuperarla durante 30 días. Si sólo querés sacarla de la web, archivala.',
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok || !row) return;
      try {
        await store.remove(row.id);
        toast('Casa eliminada.', { tone: 'ok' });
        setLeaveGuard(null);
        navigate({ view: 'casas' }, { replace: true });
      } catch (err) {
        if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
      }
    })();
  });

  /* ---------------- Werte hinein und heraus ---------------- */

  buildCtl.set(draft.buildStatus);
  airbnb.set(draft.airbnbUrl);
  beds.set(draft.beds);
  guests.set(draft.guests);
  area.set(draft.area);
  bedrooms.set(draft.bedrooms);
  bathrooms.set(draft.bathrooms);
  slugCtl.set(draft.slug);
  body.setItems(draft.body);
  amenities.setItems(draft.amenities);
  highlights.setItems(draft.highlights);

  collect = () => {
    draft.buildStatus = buildCtl.get() as CasaStatus;
    draft.airbnbUrl = airbnb.get();
    draft.beds = beds.get();
    draft.guests = guests.get();
    draft.area = area.get();
    draft.bedrooms = bedrooms.get();
    draft.bathrooms = bathrooms.get();
    draft.slug = slugCtl.get();
    draft.title = fTitle.get();
    draft.tagline = fTagline.get();
    draft.bookNote = fBookNote.get();
    draft.body = body.getItems().filter((p) => p.es || p.en);
    draft.amenities = amenities.getItems().filter((a) => a.label.es || a.label.en);
    draft.highlights = highlights.getItems().filter((h) => h.label.es || h.label.en);
    draft.images = photos.items();
  };

  /* ---------------- Kopfzeile ---------------- */

  function badge(): void {
    if (!row) return;
    if (row.status === 'archived') shell.setBadge('archived');
    else if (row.status === 'draft') shell.setBadge('draft');
    else shell.setBadge(row.has_unpublished_changes ? 'published-dirty' : 'published');
  }

  function refreshHeader(): void {
    shell.setTitle(draft.title.es);
    const c = completeness(fields);
    shell.setCompleteness(c.es, c.en, () => c.firstMissing?.field.focus(c.firstMissing.lang));

    shell.setSectionState('obra', 'ok');
    shell.setSectionState('numeros', draft.beds > 0 && draft.area > 0 ? 'ok' : 'partial');
    shell.setSectionState('fotos', draft.images.length ? 'ok' : 'empty');
    shell.setSectionState(
      'textos',
      c.es.done === c.es.total && c.en.done === c.en.total
        ? 'ok'
        : c.es.done + c.en.done === 0
          ? 'empty'
          : 'partial',
    );
    shell.setSectionState('descripcion', draft.body.length ? 'ok' : 'empty');
    shell.setSectionState(
      'equipamiento',
      draft.amenities.length && draft.highlights.length
        ? 'ok'
        : draft.amenities.length || draft.highlights.length
          ? 'partial'
          : 'empty',
    );
    shell.setSectionState('avanzado', 'ok');
    badge();
  }

  /* ---------------- Speichern ---------------- */

  async function persist(): Promise<void> {
    collect();
    if (!row) return;

    if (draft.title.es && (isDraftSlug(draft.slug) || !draft.slug)) {
      const base = slugify(draft.title.es);
      if (base) {
        draft.slug = await ensureUniqueSlug('casas', base, row.id);
        slugCtl.set(draft.slug);
      }
    }

    await store.update(row.id, casaPatch(draft));
    row.has_unpublished_changes = row.status === 'published';
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
      body: 'La casa vuelve a como está ahora en la web.',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await store.discardChanges(row.id);
      toast('Se descartaron los cambios.', { tone: 'ok' });
      navigate({ view: 'casa', id: row.id }, { replace: true });
    } catch (err) {
      if (!isSessionCancelled(err)) toast(humanError(err).message, { tone: 'error' });
    }
  });

  shell.onBack(() => navigate({ view: 'casas' }));

  /**
   * Wer „Nueva casa" antippt und es sich sofort anders überlegt, soll keine
   * leere Zeile hinterlassen -- die Zeile entstand nur, damit Fotos möglich
   * sind.
   */
  setLeaveGuard(async () => {
    if (pristineNew && row) {
      try {
        await store.remove(row.id);
      } catch {
        /* Bleibt sie liegen, ist sie ein Entwurf und stört die Website nicht. */
      }
      return true;
    }
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
    photos.destroy();
    body.destroy();
    amenities.destroy();
    highlights.destroy();
    shell.destroy();
  };
}
