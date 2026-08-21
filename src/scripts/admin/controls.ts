/**
 * Einsprachige Bausteine des Editors.
 *
 * Alles, was **nicht** übersetzt wird -- Zahlen, Daten, Auswahl, Schalter.
 * Für übersetzbaren Text gibt es `fields.ts` (gepaartes ES/EN-Feld).
 *
 * Die Bausteine erzeugen ihr Markup selbst, damit die Ansichten kein HTML
 * mehr zusammenkleben müssen. Am Handy zählt vor allem `inputmode`: eine
 * Zehnertastatur für Preise, das native Datumsfeld für Termine (Spec 2.10).
 */
import '../../styles/admin/editor.css';

export interface Control<T> {
  el: HTMLElement;
  get(): T;
  set(v: T): void;
  focus(): void;
}

let uid = 0;

function shell(label: string, hint?: string): { el: HTMLElement; id: string; body: HTMLElement } {
  const id = `ctl-${++uid}`;
  const el = document.createElement('div');
  el.className = 'adm-ctl';

  const lab = document.createElement('label');
  lab.className = 'adm-label';
  lab.htmlFor = id;
  lab.textContent = label;
  el.append(lab);

  const body = document.createElement('div');
  body.className = 'adm-ctl__body';
  el.append(body);

  if (hint) {
    const p = document.createElement('p');
    p.className = 'adm-ctl__hint';
    p.textContent = hint;
    el.append(p);
  }

  return { el, id, body };
}

export interface TextFieldOptions {
  label: string;
  hint?: string;
  placeholder?: string;
  onInput?: () => void;
}

export function textField(o: TextFieldOptions): Control<string> {
  const { el, id, body } = shell(o.label, o.hint);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'adm-input';
  if (o.placeholder) input.placeholder = o.placeholder;
  input.addEventListener('input', () => o.onInput?.());
  body.append(input);

  return {
    el,
    get: () => input.value.trim(),
    set: (v) => {
      input.value = v;
    },
    focus: () => input.focus(),
  };
}

export interface NumberFieldOptions {
  label: string;
  hint?: string;
  min?: number;
  step?: number;
  /** Kurze Einheit rechts im Feld, z. B. „h" oder „m²". */
  unit?: string;
  /** Ganze Zahlen bekommen die Ziffern-, Kommazahlen die Dezimaltastatur. */
  integer?: boolean;
  onInput?: () => void;
}

export function numberField(o: NumberFieldOptions): Control<number> {
  const { el, id, body } = shell(o.label, o.hint);
  el.classList.add('adm-ctl--number');

  const wrap = document.createElement('div');
  wrap.className = 'adm-ctl__unitwrap';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.className = 'adm-input';
  input.inputMode = o.integer ? 'numeric' : 'decimal';
  if (o.min !== undefined) input.min = String(o.min);
  input.step = String(o.step ?? (o.integer ? 1 : 0.5));
  input.addEventListener('input', () => o.onInput?.());
  wrap.append(input);

  if (o.unit) {
    const unit = document.createElement('span');
    unit.className = 'adm-ctl__unit';
    unit.textContent = o.unit;
    wrap.append(unit);
  }
  body.append(wrap);

  return {
    el,
    get: () => {
      const n = Number(input.value);
      return Number.isFinite(n) ? n : 0;
    },
    set: (v) => {
      input.value = String(v);
    },
    focus: () => input.focus(),
  };
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldOptions {
  label: string;
  hint?: string;
  options: SelectOption[];
  onChange?: () => void;
}

export function selectField(o: SelectFieldOptions): Control<string> {
  const { el, id, body } = shell(o.label, o.hint);
  const select = document.createElement('select');
  select.id = id;
  select.className = 'adm-input adm-select';
  for (const opt of o.options) {
    const el2 = document.createElement('option');
    el2.value = opt.value;
    el2.textContent = opt.label;
    select.append(el2);
  }
  select.addEventListener('change', () => o.onChange?.());
  body.append(select);

  return {
    el,
    get: () => select.value,
    set: (v) => {
      select.value = v;
    },
    focus: () => select.focus(),
  };
}

export interface IconSelectOption {
  value: string;
  label: string;
  /** Inneres SVG-Markup, viewBox 0 0 32 32. */
  art: string;
}

export interface IconSelectFieldOptions {
  label: string;
  hint?: string;
  options: IconSelectOption[];
  onChange?: () => void;
}

/**
 * Auswahl mit Zeichnungs-Vorschau, z. B. "Dibujo" bei Ausstattung/Highlights
 * einer Casa. Ein natives `<select>` kann Icons nicht innerhalb der Optionen
 * zeigen (kein Browser rendert das verlässlich) -- deshalb steht daneben ein
 * kleines Vorschaufeld, das bei jeder Auswahl live die passende Zeichnung
 * zeigt, statt nur den Namen.
 */
export function iconSelectField(o: IconSelectFieldOptions): Control<string> {
  const { el, id, body } = shell(o.label, o.hint);

  const wrap = document.createElement('div');
  wrap.className = 'adm-ctl__iconwrap';

  const preview = document.createElement('span');
  preview.className = 'adm-ctl__iconpreview';
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = '<svg viewBox="0 0 32 32"></svg>';
  const svg = preview.querySelector('svg')!;

  const select = document.createElement('select');
  select.id = id;
  select.className = 'adm-input adm-select';
  for (const opt of o.options) {
    const optEl = document.createElement('option');
    optEl.value = opt.value;
    optEl.textContent = opt.label;
    select.append(optEl);
  }

  function updatePreview(): void {
    svg.innerHTML = o.options.find((opt) => opt.value === select.value)?.art ?? '';
  }

  select.addEventListener('change', () => {
    updatePreview();
    o.onChange?.();
  });

  wrap.append(preview, select);
  body.append(wrap);
  updatePreview();

  return {
    el,
    get: () => select.value,
    set: (v) => {
      select.value = v;
      updatePreview();
    },
    focus: () => select.focus(),
  };
}

export interface DateFieldOptions {
  label?: string;
  onInput?: () => void;
}

/** Natives Datumsfeld -- am Handy der eingebaute Kalender. */
export function dateField(o: DateFieldOptions = {}): Control<string> {
  const el = document.createElement('div');
  el.className = 'adm-ctl adm-ctl--date';

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'adm-input';
  input.setAttribute('aria-label', o.label ?? 'Fecha');
  input.addEventListener('input', () => o.onInput?.());
  el.append(input);

  return {
    el,
    get: () => input.value,
    set: (v) => {
      input.value = v;
    },
    focus: () => input.focus(),
  };
}

export interface SwitchOptions {
  label: string;
  hint?: string;
  onChange?: (checked: boolean) => void;
}

/**
 * Schalter für die `show_*`-Spalten. Er steht bewusst direkt bei dem
 * Abschnitt, den er ein- und ausblendet, statt in einem Block mit sechs
 * Kästchen -- dann ist ohne Nachdenken klar, was er tut.
 */
export function switchRow(o: SwitchOptions): Control<boolean> {
  const id = `sw-${++uid}`;
  const el = document.createElement('div');
  el.className = 'adm-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.className = 'adm-switch__input';

  const label = document.createElement('label');
  label.className = 'adm-switch__label';
  label.htmlFor = id;
  label.textContent = o.label;

  el.append(input, label);

  if (o.hint) {
    const p = document.createElement('p');
    p.className = 'adm-ctl__hint';
    p.textContent = o.hint;
    el.append(p);
  }

  input.addEventListener('change', () => o.onChange?.(input.checked));

  return {
    el,
    get: () => input.checked,
    set: (v) => {
      input.checked = v;
    },
    focus: () => input.focus(),
  };
}

export interface RadioCardOption {
  value: string;
  label: string;
  /** Inneres SVG-Markup, viewBox 0 0 90 90. */
  art?: string;
}

export interface RadioCardsOptions {
  label: string;
  options: RadioCardOption[];
  onChange?: () => void;
}

/**
 * Auswahl mit Bild, z. B. das Thema eines Workshops. Umgesetzt als echte
 * Radiogruppe: die Pfeiltasten funktionieren dadurch von selbst, anders als
 * beim handgebauten `role="radio"` von v1 (Problem P12).
 */
export function radioCards(o: RadioCardsOptions): Control<string> {
  const name = `rc-${++uid}`;
  const el = document.createElement('fieldset');
  el.className = 'adm-radios';

  const legend = document.createElement('legend');
  legend.className = 'adm-label';
  legend.textContent = o.label;
  el.append(legend);

  const grid = document.createElement('div');
  grid.className = 'adm-radios__grid';
  el.append(grid);

  const inputs: HTMLInputElement[] = [];

  for (const opt of o.options) {
    const id = `${name}-${opt.value}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.id = id;
    input.value = opt.value;
    input.className = 'adm-radios__input';
    input.addEventListener('change', () => o.onChange?.());

    const label = document.createElement('label');
    label.className = 'adm-radios__card';
    label.htmlFor = id;

    if (opt.art) {
      const art = document.createElement('span');
      art.className = 'adm-radios__art';
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = `<svg viewBox="0 0 90 90">${opt.art}</svg>`;
      label.append(art);
    }

    const text = document.createElement('span');
    text.textContent = opt.label;
    label.append(text);

    grid.append(input, label);
    inputs.push(input);
  }

  return {
    el,
    get: () => inputs.find((i) => i.checked)?.value ?? o.options[0]?.value ?? '',
    set: (v) => {
      for (const i of inputs) i.checked = i.value === v;
    },
    focus: () => (inputs.find((i) => i.checked) ?? inputs[0])?.focus(),
  };
}

/** Reihe aus mehreren schmalen Feldern (Preis, Dauer, Plätze …). */
export function controlRow(...controls: Control<unknown>[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'adm-ctl-row';
  el.append(...controls.map((c) => c.el));
  return el;
}
