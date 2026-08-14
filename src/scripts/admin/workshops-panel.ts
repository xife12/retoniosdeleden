import { supabase } from '../../lib/supabase';
import { workshopThemes, type ThemeId } from '../../data/workshop-themes';
import { Repeater } from './repeater';
import { showStatus } from './status';

interface ProgrammeStepRow {
  title: string;
  text: string;
}

interface WorkshopTranslation {
  title: string;
  summary: string;
  longDesc: string;
  audience: string;
  forWhom: string;
  languages: string;
  meetingPoint: string;
  programme: ProgrammeStepRow[];
  included: string[];
  bring: string[];
}

interface WorkshopRow {
  id: string;
  slug: string;
  theme_id: ThemeId;
  status: 'published' | 'archived';
  sort_order: number;
  price: number;
  currency: string;
  hours: number;
  max_people: number;
  instructor_first_name: string;
  instructor_last_name: string;
  dates: string[];
  show_programme: boolean;
  show_included: boolean;
  show_bring: boolean;
  show_for_whom: boolean;
  show_languages: boolean;
  show_meeting_point: boolean;
  translations: { es: WorkshopTranslation; en: WorkshopTranslation };
}

function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'taller'}-${suffix}`;
}

function emptyTranslation(): WorkshopTranslation {
  return {
    title: '',
    summary: '',
    longDesc: '',
    audience: '',
    forWhom: '',
    languages: '',
    meetingPoint: '',
    programme: [],
    included: [],
    bring: [],
  };
}

let workshops: WorkshopRow[] = [];
let editingId: string | null = null;

/* ---------------- DOM-Referenzen ---------------- */

const listEl = document.querySelector<HTMLElement>('[data-workshop-list]')!;
const newBtn = document.querySelector<HTMLButtonElement>('[data-workshop-new]')!;
const themePicker = document.querySelector<HTMLElement>('[data-theme-picker]')!;

const backdrop = document.querySelector<HTMLElement>('[data-workshop-form-backdrop]')!;
const modal = document.querySelector<HTMLElement>('[data-workshop-form-modal]')!;
const form = document.querySelector<HTMLFormElement>('[data-workshop-form]')!;
const formTitle = document.querySelector<HTMLElement>('[data-workshop-form-title]')!;
const formError = document.querySelector<HTMLElement>('[data-workshop-form-error]')!;
const archiveRow = document.querySelector<HTMLElement>('[data-workshop-archive-row]')!;
const archivedCheckbox = document.querySelector<HTMLInputElement>('#wf-archived')!;
const closeBtn = document.querySelector<HTMLButtonElement>('[data-workshop-form-close]')!;
const cancelBtn = document.querySelector<HTMLButtonElement>('[data-workshop-form-cancel]')!;

const priceInp = document.querySelector<HTMLInputElement>('#wf-price')!;
const currencyInp = document.querySelector<HTMLSelectElement>('#wf-currency')!;
const hoursInp = document.querySelector<HTMLInputElement>('#wf-hours')!;
const maxPeopleInp = document.querySelector<HTMLInputElement>('#wf-max-people')!;
const instructorFirstInp = document.querySelector<HTMLInputElement>('#wf-instructor-first')!;
const instructorLastInp = document.querySelector<HTMLInputElement>('#wf-instructor-last')!;

const showProgrammeInp = document.querySelector<HTMLInputElement>('#wf-show-programme')!;
const showIncludedInp = document.querySelector<HTMLInputElement>('#wf-show-included')!;
const showBringInp = document.querySelector<HTMLInputElement>('#wf-show-bring')!;
const showForWhomInp = document.querySelector<HTMLInputElement>('#wf-show-for-whom')!;
const showLanguagesInp = document.querySelector<HTMLInputElement>('#wf-show-languages')!;
const showMeetingPointInp = document.querySelector<HTMLInputElement>('#wf-show-meeting-point')!;

let selectedTheme: ThemeId = 'bee';

/* ---------------- Themen-Auswahl ---------------- */

function renderThemePicker() {
  themePicker.replaceChildren();
  (Object.keys(workshopThemes) as ThemeId[]).forEach((id) => {
    const theme = workshopThemes[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-option';
    btn.dataset.themeId = id;
    btn.setAttribute('role', 'radio');
    btn.innerHTML = `<svg viewBox="0 0 90 90">${theme.cardIcon}</svg><span>${theme.label.es}</span>`;
    btn.addEventListener('click', () => setSelectedTheme(id));
    themePicker.append(btn);
  });
  setSelectedTheme(selectedTheme);
}

function setSelectedTheme(id: ThemeId) {
  selectedTheme = id;
  themePicker.querySelectorAll<HTMLElement>('.theme-option').forEach((el) => {
    const on = el.dataset.themeId === id;
    el.classList.toggle('is-selected', on);
    el.setAttribute('aria-checked', String(on));
  });
}

/* ---------------- Zeichen-Zähler ---------------- */

function wireCharCounter(textareaId: string, max: number) {
  const el = document.getElementById(textareaId) as HTMLTextAreaElement;
  const counter = document.querySelector<HTMLElement>(`[data-char-count-for="${textareaId}"]`)!;
  const update = () => {
    const len = el.value.length;
    counter.textContent = `${len} / ${max}`;
    counter.classList.toggle('is-over', len > max);
  };
  el.addEventListener('input', update);
  update();
}
wireCharCounter('wf-summary-es', 160);
wireCharCounter('wf-summary-en', 160);

/* ---------------- Sprach-Tabs im Formular ---------------- */

function switchToWorkshopLangTab(lang: 'es' | 'en') {
  document.querySelectorAll<HTMLElement>('[data-workshop-lang-tab]').forEach((t) => {
    const on = t.dataset.workshopLangTab === lang;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll<HTMLElement>('[data-workshop-lang-panel]').forEach((p) => {
    p.hidden = p.dataset.workshopLangPanel !== lang;
  });
}

document.querySelectorAll<HTMLElement>('[data-workshop-lang-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    switchToWorkshopLangTab(tab.dataset.workshopLangTab as 'es' | 'en');
  });
});

/**
 * Pflichtfelder liegen teils im ausgeblendeten EN-Tab. Native HTML5-Validierung
 * (required) kann auf verstecken Feldern keine Meldung zeigen und blockiert das
 * Absenden dann lautlos -- deshalb hier von Hand prüfen und bei Bedarf den
 * richtigen Tab öffnen.
 */
function validateWorkshopForm(): boolean {
  const checks: { lang: 'es' | 'en'; id: string; label: string }[] = [
    { lang: 'es', id: 'wf-title-es', label: 'Título (español)' },
    { lang: 'es', id: 'wf-summary-es', label: 'Resumen corto (español)' },
    { lang: 'es', id: 'wf-audience-es', label: 'Para quién, etiqueta corta (español)' },
    { lang: 'es', id: 'wf-long-desc-es', label: 'Descripción completa (español)' },
    { lang: 'en', id: 'wf-title-en', label: 'Title (English)' },
    { lang: 'en', id: 'wf-summary-en', label: 'Short summary (English)' },
    { lang: 'en', id: 'wf-audience-en', label: 'Audience label (English)' },
    { lang: 'en', id: 'wf-long-desc-en', label: 'Full description (English)' },
  ];

  for (const check of checks) {
    const el = document.getElementById(check.id) as HTMLInputElement | HTMLTextAreaElement;
    if (!el.value.trim()) {
      switchToWorkshopLangTab(check.lang);
      el.focus();
      formError.textContent = `Falta completar: ${check.label}.`;
      formError.hidden = false;
      return false;
    }
  }

  if (priceInp.value === '' || hoursInp.value === '' || maxPeopleInp.value === '') {
    formError.textContent = 'Completá precio, duración y máximo de personas.';
    formError.hidden = false;
    return false;
  }

  return true;
}

/* ---------------- Repeater: Termine, Programm, Inklusive, Mitbringen ---------------- */

function textRow(placeholder: string, value: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rep-fields';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(input);
  return wrap;
}

const datesRepeater = new Repeater<string>({
  container: document.querySelector('[data-workshop-dates]')!,
  addButtonLabel: '+ Agregar fecha',
  createEmpty: () => '',
  renderRow: (value) => {
    const wrap = document.createElement('div');
    wrap.className = 'rep-fields';
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value;
    wrap.append(input);
    return wrap;
  },
});

const programmeRepeaters: Record<'es' | 'en', Repeater<ProgrammeStepRow>> = {
  es: new Repeater<ProgrammeStepRow>({
    container: document.querySelector('[data-workshop-programme="es"]')!,
    addButtonLabel: '+ Agregar paso',
    createEmpty: () => ({ title: '', text: '' }),
    renderRow: (item) => {
      const wrap = document.createElement('div');
      wrap.className = 'rep-fields';
      const title = document.createElement('input');
      title.type = 'text';
      title.placeholder = 'Título del paso';
      title.value = item.title;
      const text = document.createElement('textarea');
      text.rows = 2;
      text.placeholder = 'Descripción';
      text.value = item.text;
      wrap.append(title, text);
      return wrap;
    },
  }),
  en: new Repeater<ProgrammeStepRow>({
    container: document.querySelector('[data-workshop-programme="en"]')!,
    addButtonLabel: '+ Add step',
    createEmpty: () => ({ title: '', text: '' }),
    renderRow: (item) => {
      const wrap = document.createElement('div');
      wrap.className = 'rep-fields';
      const title = document.createElement('input');
      title.type = 'text';
      title.placeholder = 'Step title';
      title.value = item.title;
      const text = document.createElement('textarea');
      text.rows = 2;
      text.placeholder = 'Description';
      text.value = item.text;
      wrap.append(title, text);
      return wrap;
    },
  }),
};

const includedRepeaters: Record<'es' | 'en', Repeater<string>> = {
  es: new Repeater<string>({
    container: document.querySelector('[data-workshop-included="es"]')!,
    addButtonLabel: '+ Agregar',
    createEmpty: () => '',
    renderRow: (v) => textRow('Ej: Mate y bizcochos', v),
  }),
  en: new Repeater<string>({
    container: document.querySelector('[data-workshop-included="en"]')!,
    addButtonLabel: '+ Add',
    createEmpty: () => '',
    renderRow: (v) => textRow('E.g. Mate and biscuits', v),
  }),
};

const bringRepeaters: Record<'es' | 'en', Repeater<string>> = {
  es: new Repeater<string>({
    container: document.querySelector('[data-workshop-bring="es"]')!,
    addButtonLabel: '+ Agregar',
    createEmpty: () => '',
    renderRow: (v) => textRow('Ej: Ropa cómoda', v),
  }),
  en: new Repeater<string>({
    container: document.querySelector('[data-workshop-bring="en"]')!,
    addButtonLabel: '+ Add',
    createEmpty: () => '',
    renderRow: (v) => textRow('E.g. Comfortable clothes', v),
  }),
};

function readTextRow(row: HTMLElement): string {
  return row.querySelector('input')?.value.trim() ?? '';
}

function readDateRow(row: HTMLElement): string {
  return row.querySelector('input')?.value ?? '';
}

function readProgrammeRow(row: HTMLElement): ProgrammeStepRow {
  const [title, text] = Array.from(row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
  return { title: title?.value.trim() ?? '', text: text?.value.trim() ?? '' };
}

/* ---------------- Formular öffnen/schließen ---------------- */

function openForm(row: WorkshopRow | null) {
  editingId = row?.id ?? null;
  formError.hidden = true;
  form.reset();

  formTitle.textContent = row ? 'Editar taller' : 'Nuevo taller';
  archiveRow.hidden = !row;
  archivedCheckbox.checked = row?.status === 'archived';

  setSelectedTheme(row?.theme_id ?? 'bee');
  priceInp.value = row ? String(row.price) : '';
  currencyInp.value = row?.currency ?? 'USD';
  hoursInp.value = row ? String(row.hours) : '';
  maxPeopleInp.value = row ? String(row.max_people) : '';
  instructorFirstInp.value = row?.instructor_first_name ?? '';
  instructorLastInp.value = row?.instructor_last_name ?? '';

  showProgrammeInp.checked = row?.show_programme ?? true;
  showIncludedInp.checked = row?.show_included ?? true;
  showBringInp.checked = row?.show_bring ?? true;
  showForWhomInp.checked = row?.show_for_whom ?? true;
  showLanguagesInp.checked = row?.show_languages ?? true;
  showMeetingPointInp.checked = row?.show_meeting_point ?? true;

  datesRepeater.setItems(row?.dates ?? []);

  for (const lang of ['es', 'en'] as const) {
    const t = row?.translations[lang] ?? emptyTranslation();
    (document.getElementById(`wf-title-${lang}`) as HTMLInputElement).value = t.title;
    (document.getElementById(`wf-summary-${lang}`) as HTMLTextAreaElement).value = t.summary;
    (document.getElementById(`wf-audience-${lang}`) as HTMLInputElement).value = t.audience;
    (document.getElementById(`wf-long-desc-${lang}`) as HTMLTextAreaElement).value = t.longDesc;
    (document.getElementById(`wf-for-whom-${lang}`) as HTMLTextAreaElement).value = t.forWhom;
    (document.getElementById(`wf-languages-${lang}`) as HTMLInputElement).value = t.languages;
    (document.getElementById(`wf-meeting-point-${lang}`) as HTMLTextAreaElement).value = t.meetingPoint;
    programmeRepeaters[lang].setItems(t.programme);
    includedRepeaters[lang].setItems(t.included);
    bringRepeaters[lang].setItems(t.bring);
    document.getElementById(`wf-summary-${lang}`)?.dispatchEvent(new Event('input'));
  }

  switchToWorkshopLangTab('es');

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

  if (!validateWorkshopForm()) return;

  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitBtn.disabled = true;

  try {
    const translations = {
      es: {
        title: (document.getElementById('wf-title-es') as HTMLInputElement).value.trim(),
        summary: (document.getElementById('wf-summary-es') as HTMLTextAreaElement).value.trim(),
        audience: (document.getElementById('wf-audience-es') as HTMLInputElement).value.trim(),
        longDesc: (document.getElementById('wf-long-desc-es') as HTMLTextAreaElement).value.trim(),
        forWhom: (document.getElementById('wf-for-whom-es') as HTMLTextAreaElement).value.trim(),
        languages: (document.getElementById('wf-languages-es') as HTMLInputElement).value.trim(),
        meetingPoint: (document.getElementById('wf-meeting-point-es') as HTMLTextAreaElement).value.trim(),
        programme: programmeRepeaters.es.getValues(readProgrammeRow).filter((p) => p.title || p.text),
        included: includedRepeaters.es.getValues(readTextRow).filter(Boolean),
        bring: bringRepeaters.es.getValues(readTextRow).filter(Boolean),
      },
      en: {
        title: (document.getElementById('wf-title-en') as HTMLInputElement).value.trim(),
        summary: (document.getElementById('wf-summary-en') as HTMLTextAreaElement).value.trim(),
        audience: (document.getElementById('wf-audience-en') as HTMLInputElement).value.trim(),
        longDesc: (document.getElementById('wf-long-desc-en') as HTMLTextAreaElement).value.trim(),
        forWhom: (document.getElementById('wf-for-whom-en') as HTMLTextAreaElement).value.trim(),
        languages: (document.getElementById('wf-languages-en') as HTMLInputElement).value.trim(),
        meetingPoint: (document.getElementById('wf-meeting-point-en') as HTMLTextAreaElement).value.trim(),
        programme: programmeRepeaters.en.getValues(readProgrammeRow).filter((p) => p.title || p.text),
        included: includedRepeaters.en.getValues(readTextRow).filter(Boolean),
        bring: bringRepeaters.en.getValues(readTextRow).filter(Boolean),
      },
    };

    const dates = datesRepeater.getValues(readDateRow).filter(Boolean).sort();

    const payload = {
      theme_id: selectedTheme,
      price: Number(priceInp.value),
      currency: currencyInp.value,
      hours: Number(hoursInp.value),
      max_people: Number(maxPeopleInp.value),
      instructor_first_name: instructorFirstInp.value.trim(),
      instructor_last_name: instructorLastInp.value.trim(),
      dates,
      show_programme: showProgrammeInp.checked,
      show_included: showIncludedInp.checked,
      show_bring: showBringInp.checked,
      show_for_whom: showForWhomInp.checked,
      show_languages: showLanguagesInp.checked,
      show_meeting_point: showMeetingPointInp.checked,
      translations,
      ...(editingId ? { status: archivedCheckbox.checked ? 'archived' : 'published' } : {}),
    };

    if (editingId) {
      const { error } = await supabase.from('workshops').update(payload).eq('id', editingId);
      if (error) throw error;
    } else {
      const maxSort = workshops.reduce((m, w) => Math.max(m, w.sort_order), 0);
      const { error } = await supabase.from('workshops').insert({
        ...payload,
        slug: slugify(translations.es.title || translations.en.title),
        status: 'published',
        sort_order: maxSort + 10,
      });
      if (error) throw error;
    }

    closeForm();
    document.dispatchEvent(new CustomEvent('admin:saved'));
    await loadWorkshops();
  } catch (err) {
    formError.textContent = err instanceof Error ? err.message : 'No se pudo guardar.';
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- Liste ---------------- */

async function loadWorkshops() {
  const { data, error } = await supabase.from('workshops').select('*').order('sort_order', { ascending: true });
  if (error) {
    listEl.innerHTML = `<li class="err">No se pudieron cargar los talleres: ${error.message}</li>`;
    return;
  }
  workshops = data as WorkshopRow[];
  renderList();
}

function renderList() {
  listEl.replaceChildren();
  for (const w of workshops) {
    const li = document.createElement('li');
    const t = w.translations.es;
    const archived = w.status === 'archived';
    li.innerHTML = `
      <div class="admin-item-main">
        <div class="admin-item-title">${t.title || '(sin título)'}${archived ? ' <span class="admin-item-badge">Archivado</span>' : ''}</div>
        <div class="admin-item-meta">${workshopThemes[w.theme_id]?.label.es ?? w.theme_id} · ${w.price} ${w.currency}</div>
      </div>
      <div class="admin-item-order">
        <button type="button" data-act="up" aria-label="Subir">↑</button>
        <button type="button" data-act="down" aria-label="Bajar">↓</button>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="btn btn--ghost" data-act="edit">Editar</button>
        <button type="button" class="btn btn--ghost" data-act="archive">${archived ? 'Publicar' : 'Archivar'}</button>
        <button type="button" class="btn btn--ghost admin-danger" data-act="delete">Eliminar</button>
      </div>
    `;
    li.querySelector('[data-act="edit"]')?.addEventListener('click', () => openForm(w));
    li.querySelector('[data-act="archive"]')?.addEventListener('click', () => toggleArchive(w));
    li.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteWorkshop(w));
    li.querySelector('[data-act="up"]')?.addEventListener('click', () => move(w, -1));
    li.querySelector('[data-act="down"]')?.addEventListener('click', () => move(w, 1));
    listEl.append(li);
  }
}

async function toggleArchive(w: WorkshopRow) {
  const t = w.translations.es;
  const archiving = w.status !== 'archived';
  const status = archiving ? 'archived' : 'published';
  const { error } = await supabase.from('workshops').update({ status }).eq('id', w.id);
  if (error) {
    showStatus(`No se pudo actualizar "${t.title}": ${error.message}`, true);
    return;
  }
  showStatus(
    archiving
      ? `"${t.title}" archivado — ya no se muestra en la web.`
      : `"${t.title}" publicado — vuelve a mostrarse en la web.`,
  );
  await loadWorkshops();
}

async function deleteWorkshop(w: WorkshopRow) {
  const t = w.translations.es;
  if (!confirm(`¿Eliminar "${t.title}" para siempre? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('workshops').delete().eq('id', w.id);
  if (error) {
    showStatus(`No se pudo eliminar "${t.title}": ${error.message}`, true);
    return;
  }
  showStatus(`"${t.title}" eliminado.`);
  await loadWorkshops();
}

async function move(w: WorkshopRow, direction: -1 | 1) {
  const index = workshops.findIndex((x) => x.id === w.id);
  const swapWith = workshops[index + direction];
  if (!swapWith) return;
  const [r1, r2] = await Promise.all([
    supabase.from('workshops').update({ sort_order: swapWith.sort_order }).eq('id', w.id),
    supabase.from('workshops').update({ sort_order: w.sort_order }).eq('id', swapWith.id),
  ]);
  if (r1.error || r2.error) {
    showStatus(`No se pudo reordenar: ${(r1.error ?? r2.error)?.message}`, true);
    return;
  }
  await loadWorkshops();
}

/* ---------------- Start ---------------- */

renderThemePicker();
document.addEventListener('admin:signed-in', () => {
  loadWorkshops();
});
