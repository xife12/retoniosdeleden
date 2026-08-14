import { supabase } from '../../lib/supabase';
import { casaGlyphs, casaGlyphLabels, factGlyphs, type CasaGlyph } from '../../data/casa-glyphs';
import { Repeater } from './repeater';
import { showStatus } from './status';
import {
  uploadCasaImage,
  deleteCasaImage,
  updateCasaImage,
  fetchCasaImages,
  type CasaImageRow,
} from './image-upload';

interface BilingualText {
  es: string;
  en: string;
}

interface AmenityRow {
  glyph: CasaGlyph;
  label: BilingualText;
}

interface HighlightRow {
  glyph: CasaGlyph;
  label: BilingualText;
  note: BilingualText;
}

interface CasaTranslation {
  title: string;
  tagline: string;
  body: string[];
  bookNote: string;
}

interface CasaRow {
  id: string;
  slug: string;
  status: 'listo' | 'enObra' | 'planeado';
  archived: boolean;
  sort_order: number;
  airbnb_url: string | null;
  beds: number;
  guests: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  amenities: AmenityRow[];
  highlights: HighlightRow[];
  translations: { es: CasaTranslation; en: CasaTranslation };
}

const statusLabels: Record<CasaRow['status'], string> = {
  listo: 'Terminada',
  enObra: 'En obra',
  planeado: 'Planeada',
};

/** Glyphen, die als Ausstattung/Highlight wählbar sind (Eckdaten-Icons ausgeschlossen). */
const pickableGlyphs = (Object.keys(casaGlyphs) as CasaGlyph[]).filter((g) => !factGlyphs.includes(g));

function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'casa'}-${suffix}`;
}

function emptyTranslation(): CasaTranslation {
  return { title: '', tagline: '', body: [], bookNote: '' };
}

let casas: CasaRow[] = [];
let editingId: string | null = null;
let currentImages: CasaImageRow[] = [];

/* ---------------- DOM-Referenzen ---------------- */

const listEl = document.querySelector<HTMLElement>('[data-casa-list]')!;
const newBtn = document.querySelector<HTMLButtonElement>('[data-casa-new]')!;

const backdrop = document.querySelector<HTMLElement>('[data-casa-form-backdrop]')!;
const modal = document.querySelector<HTMLElement>('[data-casa-form-modal]')!;
const form = document.querySelector<HTMLFormElement>('[data-casa-form]')!;
const formTitle = document.querySelector<HTMLElement>('[data-casa-form-title]')!;
const formError = document.querySelector<HTMLElement>('[data-casa-form-error]')!;
const archiveRow = document.querySelector<HTMLElement>('[data-casa-archive-row]')!;
const archivedCheckbox = document.querySelector<HTMLInputElement>('#cf-archived')!;
const closeBtn = document.querySelector<HTMLButtonElement>('[data-casa-form-close]')!;
const cancelBtn = document.querySelector<HTMLButtonElement>('[data-casa-form-cancel]')!;

const statusInp = document.querySelector<HTMLSelectElement>('#cf-status')!;
const airbnbInp = document.querySelector<HTMLInputElement>('#cf-airbnb-url')!;
const bedsInp = document.querySelector<HTMLInputElement>('#cf-beds')!;
const guestsInp = document.querySelector<HTMLInputElement>('#cf-guests')!;
const areaInp = document.querySelector<HTMLInputElement>('#cf-area')!;
const bedroomsInp = document.querySelector<HTMLInputElement>('#cf-bedrooms')!;
const bathroomsInp = document.querySelector<HTMLInputElement>('#cf-bathrooms')!;

const imageInput = document.querySelector<HTMLInputElement>('[data-casa-image-input]')!;
const imageGrid = document.querySelector<HTMLElement>('[data-casa-image-grid]')!;
const photoHintNew = document.querySelector<HTMLElement>('[data-casa-photo-hint-new]')!;

/* ---------------- Sprach-Tabs ---------------- */

function switchToCasaLangTab(lang: 'es' | 'en') {
  document.querySelectorAll<HTMLElement>('[data-casa-lang-tab]').forEach((t) => {
    const on = t.dataset.casaLangTab === lang;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll<HTMLElement>('[data-casa-lang-panel]').forEach((p) => {
    p.hidden = p.dataset.casaLangPanel !== lang;
  });
}

document.querySelectorAll<HTMLElement>('[data-casa-lang-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    switchToCasaLangTab(tab.dataset.casaLangTab as 'es' | 'en');
  });
});

/**
 * Pflichtfelder liegen teils im ausgeblendeten EN-Tab. Native HTML5-Validierung
 * (required) kann auf verstecken Feldern keine Meldung zeigen und blockiert das
 * Absenden dann lautlos -- deshalb hier von Hand prüfen und bei Bedarf den
 * richtigen Tab öffnen.
 */
function validateCasaForm(): boolean {
  const checks: { lang: 'es' | 'en'; id: string; label: string }[] = [
    { lang: 'es', id: 'cf-title-es', label: 'Nombre de la casa (español)' },
    { lang: 'es', id: 'cf-tagline-es', label: 'Frase corta (español)' },
    { lang: 'es', id: 'cf-body-es', label: 'Descripción (español)' },
    { lang: 'en', id: 'cf-title-en', label: 'House name (English)' },
    { lang: 'en', id: 'cf-tagline-en', label: 'Short line (English)' },
    { lang: 'en', id: 'cf-body-en', label: 'Description (English)' },
  ];

  for (const check of checks) {
    const el = document.getElementById(check.id) as HTMLInputElement | HTMLTextAreaElement;
    if (!el.value.trim()) {
      switchToCasaLangTab(check.lang);
      el.focus();
      formError.textContent = `Falta completar: ${check.label}.`;
      formError.hidden = false;
      return false;
    }
  }

  if (
    bedsInp.value === '' ||
    guestsInp.value === '' ||
    areaInp.value === '' ||
    bedroomsInp.value === '' ||
    bathroomsInp.value === ''
  ) {
    formError.textContent = 'Completá camas, huéspedes, superficie, dormitorios y baños.';
    formError.hidden = false;
    return false;
  }

  return true;
}

/* ---------------- Glyph-Select-Baustein ---------------- */

function glyphSelect(selected: CasaGlyph): HTMLSelectElement {
  const select = document.createElement('select');
  for (const g of pickableGlyphs) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = casaGlyphLabels[g].es;
    if (g === selected) opt.selected = true;
    select.append(opt);
  }
  return select;
}

/* ---------------- Repeater: Ausstattung / Highlights ---------------- */

const amenitiesRepeater = new Repeater<AmenityRow>({
  container: document.querySelector('[data-casa-amenities]')!,
  addButtonLabel: '+ Agregar equipamiento',
  createEmpty: () => ({ glyph: pickableGlyphs[0], label: { es: '', en: '' } }),
  renderRow: (item) => {
    const wrap = document.createElement('div');
    wrap.className = 'rep-fields';
    wrap.append(glyphSelect(item.glyph));
    const es = document.createElement('input');
    es.type = 'text';
    es.placeholder = 'Descripción en español';
    es.value = item.label.es;
    es.dataset.lang = 'es';
    const en = document.createElement('input');
    en.type = 'text';
    en.placeholder = 'Description in English';
    en.value = item.label.en;
    en.dataset.lang = 'en';
    wrap.append(es, en);
    return wrap;
  },
});

const highlightsRepeater = new Repeater<HighlightRow>({
  container: document.querySelector('[data-casa-highlights]')!,
  addButtonLabel: '+ Agregar detalle especial',
  createEmpty: () => ({ glyph: pickableGlyphs[0], label: { es: '', en: '' }, note: { es: '', en: '' } }),
  renderRow: (item) => {
    const wrap = document.createElement('div');
    wrap.className = 'rep-fields';
    wrap.append(glyphSelect(item.glyph));
    const labelEs = document.createElement('input');
    labelEs.type = 'text';
    labelEs.placeholder = 'Título en español';
    labelEs.value = item.label.es;
    const labelEn = document.createElement('input');
    labelEn.type = 'text';
    labelEn.placeholder = 'Title in English';
    labelEn.value = item.label.en;
    const noteEs = document.createElement('textarea');
    noteEs.rows = 2;
    noteEs.placeholder = 'Nota en español';
    noteEs.value = item.note.es;
    const noteEn = document.createElement('textarea');
    noteEn.rows = 2;
    noteEn.placeholder = 'Note in English';
    noteEn.value = item.note.en;
    wrap.append(labelEs, labelEn, noteEs, noteEn);
    return wrap;
  },
});

function readAmenityRow(row: HTMLElement): AmenityRow {
  const select = row.querySelector('select')!;
  const [es, en] = Array.from(row.querySelectorAll<HTMLInputElement>('input'));
  return {
    glyph: select.value as CasaGlyph,
    label: { es: es?.value.trim() ?? '', en: en?.value.trim() ?? '' },
  };
}

function readHighlightRow(row: HTMLElement): HighlightRow {
  const select = row.querySelector('select')!;
  const [labelEs, labelEn] = Array.from(row.querySelectorAll<HTMLInputElement>('input'));
  const [noteEs, noteEn] = Array.from(row.querySelectorAll<HTMLTextAreaElement>('textarea'));
  return {
    glyph: select.value as CasaGlyph,
    label: { es: labelEs?.value.trim() ?? '', en: labelEn?.value.trim() ?? '' },
    note: { es: noteEs?.value.trim() ?? '', en: noteEn?.value.trim() ?? '' },
  };
}

/* ---------------- Fotos ---------------- */

function renderImageGrid() {
  imageGrid.replaceChildren();
  for (const img of currentImages) {
    const item = document.createElement('div');
    item.className = 'casa-image-item';
    item.innerHTML = `
      <img src="${img.url}" alt="" loading="lazy" />
      <input type="text" placeholder="Descripción (ES)" value="${img.alt_es.replace(/"/g, '&quot;')}" data-img-alt="es" />
      <input type="text" placeholder="Description (EN)" value="${img.alt_en.replace(/"/g, '&quot;')}" data-img-alt="en" />
      <div class="casa-image-actions">
        <button type="button" class="rep-move" data-img-up aria-label="Subir">↑</button>
        <button type="button" class="rep-move" data-img-down aria-label="Bajar">↓</button>
        <button type="button" class="rep-remove" data-img-delete aria-label="Eliminar">✕</button>
      </div>
    `;
    item.querySelector<HTMLInputElement>('[data-img-alt="es"]')!.addEventListener('change', (e) => {
      const value = (e.target as HTMLInputElement).value;
      img.alt_es = value;
      updateCasaImage(img.id, { alt_es: value }).catch(() => {});
    });
    item.querySelector<HTMLInputElement>('[data-img-alt="en"]')!.addEventListener('change', (e) => {
      const value = (e.target as HTMLInputElement).value;
      img.alt_en = value;
      updateCasaImage(img.id, { alt_en: value }).catch(() => {});
    });
    item.querySelector('[data-img-delete]')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta foto?')) return;
      await deleteCasaImage(img);
      currentImages = currentImages.filter((i) => i.id !== img.id);
      renderImageGrid();
    });
    item.querySelector('[data-img-up]')?.addEventListener('click', () => moveImage(img, -1));
    item.querySelector('[data-img-down]')?.addEventListener('click', () => moveImage(img, 1));
    imageGrid.append(item);
  }
}

async function moveImage(img: CasaImageRow, direction: -1 | 1) {
  const index = currentImages.findIndex((i) => i.id === img.id);
  const swapWith = currentImages[index + direction];
  if (!swapWith) return;
  await Promise.all([
    updateCasaImage(img.id, { sort_order: swapWith.sort_order }),
    updateCasaImage(swapWith.id, { sort_order: img.sort_order }),
  ]);
  const tmp = img.sort_order;
  img.sort_order = swapWith.sort_order;
  swapWith.sort_order = tmp;
  currentImages.sort((a, b) => a.sort_order - b.sort_order);
  renderImageGrid();
}

imageInput.addEventListener('change', async () => {
  if (!editingId || !imageInput.files) return;
  const files = Array.from(imageInput.files);
  imageInput.disabled = true;
  try {
    let nextSort = currentImages.reduce((m, i) => Math.max(m, i.sort_order), 0) + 10;
    for (const file of files) {
      const row = await uploadCasaImage(editingId, file, nextSort);
      currentImages.push(row);
      nextSort += 10;
    }
    renderImageGrid();
  } catch (err) {
    formError.textContent = err instanceof Error ? err.message : 'No se pudo subir la foto.';
    formError.hidden = false;
  } finally {
    imageInput.disabled = false;
    imageInput.value = '';
  }
});

/* ---------------- Formular öffnen/schließen ---------------- */

async function openForm(row: CasaRow | null) {
  editingId = row?.id ?? null;
  formError.hidden = true;
  form.reset();

  formTitle.textContent = row ? 'Editar casa' : 'Nueva casa';
  archiveRow.hidden = !row;
  archivedCheckbox.checked = row?.archived ?? false;

  statusInp.value = row?.status ?? 'planeado';
  airbnbInp.value = row?.airbnb_url ?? '';
  bedsInp.value = row ? String(row.beds) : '';
  guestsInp.value = row ? String(row.guests) : '';
  areaInp.value = row ? String(row.area) : '';
  bedroomsInp.value = row ? String(row.bedrooms) : '';
  bathroomsInp.value = row ? String(row.bathrooms) : '';

  amenitiesRepeater.setItems(row?.amenities ?? []);
  highlightsRepeater.setItems(row?.highlights ?? []);

  for (const lang of ['es', 'en'] as const) {
    const t = row?.translations[lang] ?? emptyTranslation();
    (document.getElementById(`cf-title-${lang}`) as HTMLInputElement).value = t.title;
    (document.getElementById(`cf-tagline-${lang}`) as HTMLTextAreaElement).value = t.tagline;
    (document.getElementById(`cf-body-${lang}`) as HTMLTextAreaElement).value = t.body.join('\n');
    (document.getElementById(`cf-book-note-${lang}`) as HTMLTextAreaElement).value = t.bookNote;
  }
  switchToCasaLangTab('es');

  imageInput.disabled = !editingId;
  imageInput.hidden = !editingId;
  photoHintNew.hidden = Boolean(editingId);
  currentImages = editingId ? await fetchCasaImages(editingId) : [];
  renderImageGrid();

  modal.hidden = false;
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeForm() {
  modal.hidden = true;
  backdrop.hidden = true;
  document.body.style.overflow = '';
  editingId = null;
}

newBtn.addEventListener('click', () => openForm(null));
closeBtn.addEventListener('click', closeForm);
cancelBtn.addEventListener('click', closeForm);
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeForm();
});

/* ---------------- Speichern ---------------- */

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (!validateCasaForm()) return;

  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitBtn.disabled = true;

  try {
    const translations = {
      es: {
        title: (document.getElementById('cf-title-es') as HTMLInputElement).value.trim(),
        tagline: (document.getElementById('cf-tagline-es') as HTMLTextAreaElement).value.trim(),
        body: (document.getElementById('cf-body-es') as HTMLTextAreaElement).value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        bookNote: (document.getElementById('cf-book-note-es') as HTMLTextAreaElement).value.trim(),
      },
      en: {
        title: (document.getElementById('cf-title-en') as HTMLInputElement).value.trim(),
        tagline: (document.getElementById('cf-tagline-en') as HTMLTextAreaElement).value.trim(),
        body: (document.getElementById('cf-body-en') as HTMLTextAreaElement).value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        bookNote: (document.getElementById('cf-book-note-en') as HTMLTextAreaElement).value.trim(),
      },
    };

    const payload = {
      status: statusInp.value,
      airbnb_url: airbnbInp.value.trim() || null,
      beds: Number(bedsInp.value),
      guests: Number(guestsInp.value),
      area: Number(areaInp.value),
      bedrooms: Number(bedroomsInp.value),
      bathrooms: Number(bathroomsInp.value),
      amenities: amenitiesRepeater.getValues(readAmenityRow).filter((a) => a.label.es || a.label.en),
      highlights: highlightsRepeater.getValues(readHighlightRow).filter((h) => h.label.es || h.label.en),
      translations,
      ...(editingId ? { archived: archivedCheckbox.checked } : {}),
    };

    if (editingId) {
      const { error } = await supabase.from('casas').update(payload).eq('id', editingId);
      if (error) throw error;
      closeForm();
    } else {
      const maxSort = casas.reduce((m, c) => Math.max(m, c.sort_order), 0);
      const { data, error } = await supabase
        .from('casas')
        .insert({
          ...payload,
          slug: slugify(translations.es.title || translations.en.title),
          archived: false,
          sort_order: maxSort + 10,
        })
        .select()
        .single();
      if (error) throw error;
      // Formular offen lassen und direkt in den Bearbeiten-Modus wechseln,
      // damit ohne Zwischenschritt Fotos hochgeladen werden können.
      await loadCasas();
      openForm(casas.find((c) => c.id === (data as CasaRow).id) ?? null);
      return;
    }

    document.dispatchEvent(new CustomEvent('admin:saved'));
    await loadCasas();
  } catch (err) {
    formError.textContent = err instanceof Error ? err.message : 'No se pudo guardar.';
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- Liste ---------------- */

async function loadCasas() {
  const { data, error } = await supabase.from('casas').select('*').order('sort_order', { ascending: true });
  if (error) {
    listEl.innerHTML = `<li class="err">No se pudieron cargar las casas: ${error.message}</li>`;
    return;
  }
  casas = data as CasaRow[];
  renderList();
}

function renderList() {
  listEl.replaceChildren();
  for (const c of casas) {
    const li = document.createElement('li');
    const t = c.translations.es;
    li.innerHTML = `
      <div class="admin-item-main">
        <div class="admin-item-title">${t.title || '(sin nombre)'}${c.archived ? ' <span class="admin-item-badge">Archivada</span>' : ''}</div>
        <div class="admin-item-meta">${statusLabels[c.status]} · ${c.beds} camas · ${c.guests} huéspedes</div>
      </div>
      <div class="admin-item-order">
        <button type="button" data-act="up" aria-label="Subir">↑</button>
        <button type="button" data-act="down" aria-label="Bajar">↓</button>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="btn btn--ghost" data-act="edit">Editar</button>
        <button type="button" class="btn btn--ghost" data-act="archive">${c.archived ? 'Publicar' : 'Archivar'}</button>
        <button type="button" class="btn btn--ghost admin-danger" data-act="delete">Eliminar</button>
      </div>
    `;
    li.querySelector('[data-act="edit"]')?.addEventListener('click', () => openForm(c));
    li.querySelector('[data-act="archive"]')?.addEventListener('click', () => toggleArchive(c));
    li.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteCasa(c));
    li.querySelector('[data-act="up"]')?.addEventListener('click', () => move(c, -1));
    li.querySelector('[data-act="down"]')?.addEventListener('click', () => move(c, 1));
    listEl.append(li);
  }
}

async function toggleArchive(c: CasaRow) {
  const t = c.translations.es;
  const archiving = !c.archived;
  const { error } = await supabase.from('casas').update({ archived: archiving }).eq('id', c.id);
  if (error) {
    showStatus(`No se pudo actualizar "${t.title}": ${error.message}`, true);
    return;
  }
  showStatus(
    archiving
      ? `"${t.title}" archivada — ya no se muestra en la web.`
      : `"${t.title}" publicada — vuelve a mostrarse en la web.`,
  );
  await loadCasas();
}

async function deleteCasa(c: CasaRow) {
  const t = c.translations.es;
  if (!confirm(`¿Eliminar "${t.title}" para siempre? Las fotos también se borran. Esta acción no se puede deshacer.`)) return;
  const images = await fetchCasaImages(c.id);
  for (const img of images) await deleteCasaImage(img);
  const { error } = await supabase.from('casas').delete().eq('id', c.id);
  if (error) {
    showStatus(`No se pudo eliminar "${t.title}": ${error.message}`, true);
    return;
  }
  showStatus(`"${t.title}" eliminada.`);
  await loadCasas();
}

async function move(c: CasaRow, direction: -1 | 1) {
  const index = casas.findIndex((x) => x.id === c.id);
  const swapWith = casas[index + direction];
  if (!swapWith) return;
  const [r1, r2] = await Promise.all([
    supabase.from('casas').update({ sort_order: swapWith.sort_order }).eq('id', c.id),
    supabase.from('casas').update({ sort_order: c.sort_order }).eq('id', swapWith.id),
  ]);
  if (r1.error || r2.error) {
    showStatus(`No se pudo reordenar: ${(r1.error ?? r2.error)?.message}`, true);
    return;
  }
  await loadCasas();
}

/* ---------------- Start ---------------- */

document.addEventListener('admin:signed-in', () => {
  loadCasas();
});
